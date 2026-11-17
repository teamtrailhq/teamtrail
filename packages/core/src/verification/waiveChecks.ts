import { randomUUID } from 'node:crypto';
import { journalFile } from '../history/journalFile';
import type { AnswerVia } from '../model/answerVia';
import type { CheckWaiver, WaiverCheck } from '../model/checkWaiver';
import type { TicketPhase } from '../model/lifecycle';
import type { MapSnapshot, Ticket } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { firstSentence } from '../planning/decisions/decisionRecord';
import { ticketPhase } from '../planning/lifecycle/phase';
import { transition } from '../planning/lifecycle/transition';
import { recordDecision } from '../planning/operations/decisionOps';
import { OperationError } from '../planning/operations/operationError';
import { assertMayWaive } from './assertMayWaive';
import { checksApproval, checksWaitReason, ChecksNotApproved } from './checksApproval';
import { checkWaivers } from './checkWaivers';
import { readAttempts } from './evidenceStore';
import { submissionOf } from './resubmit';
import { levelFor, verify, type VerifyEnv } from './verifyCompletion';
import { waivableChecks } from './waivableChecks';

export interface WaiveRequest {
  mapId: string;
  ticketId: string;
  /** The completion the page showed failing. */
  attemptId: string;
  /** Each check to go without, with the hash of what the page showed of it (waivableChecks.ts). */
  checks: { name: string; hash: string }[];
  reason: string;
  /** The person, when the sign-in named them. */
  person?: string;
  /** How the trail lead gave it, set by the route (lookoutVia.ts). */
  via: AnswerVia;
  /** The request came from this machine (`fromThisMachine`). */
  local: boolean;
}

/** Held by its checks: back for rework, blocked for the human, or claimed again after them. */
const HELD: TicketPhase[] = ['rework', 'blocked', 'working'];
const TRAIL_LEAD = 'trail lead';

/**
 * The trail lead's "Accept without <check>": the ticket's checks that failed on its latest completion stop counting
 * for this ticket, for the reason they give. Kept as their decision, in the machine store (checkWaivers.ts) and the
 * trail's journal. A ticket the checks hold runs its other checks again on the same submission at once; one an agent
 * is working on again goes without them on its next completion. The proof shows each waived check (proofGaps.ts).
 */
export async function waiveChecks(env: VerifyEnv, r: WaiveRequest): Promise<{ waiver: string; attemptId?: string }> {
  const reason = r.reason.trim();
  if (!reason) throw new OperationError('Say why it can go without them.');
  const snap = await env.adapter.loadMap(r.mapId);
  const t = snap.tickets.find((x) => x.id === r.ticketId);
  if (!t) throw new OperationError(`ticket ${r.ticketId} not found`);
  const phase = ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x])), snap.map.mode);
  if (!HELD.includes(phase)) throw new OperationError(`${t.key} is ${phase}: no failing check holds it.`);
  const last = readAttempts(env.root, r.mapId, t.id).at(-1);
  if (last?.id !== r.attemptId)
    throw new OperationError(`${t.key} has a newer completion since you looked: look again.`);
  const checks = chosen(last, r.checks, t.key);
  await assertMayWaive(env.root, { ...r, key: t.key });
  // nothing moves while the commands wait: the trail lead approves them first
  const approval = checksApproval(env.root);
  if (phase !== 'working' && approval.waiting) throw new ChecksNotApproved(checksWaitReason(approval));
  const w = await keep(env, { r: { ...r, reason }, t, checks });
  if (phase === 'working') return { waiver: w.id };
  return { waiver: w.id, attemptId: await rerunWithout(env, { snap, t, last, w, phase }) };
}

/** The checks asked for, each one that failed on the latest completion, as the page showed it. */
function chosen(last: VerificationAttempt, asked: WaiveRequest['checks'], key: string): WaiverCheck[] {
  if (!asked.length) throw new OperationError('Name the checks it can go without.');
  const offered = waivableChecks(last);
  return asked.map((a) => {
    const c = offered.find((o) => o.name === a.name);
    if (!c) throw new OperationError(`${a.name} didn't fail on ${key}'s latest completion.`);
    if (c.hash !== a.hash) throw new OperationError(`${a.name} changed since you opened it: look again.`);
    return { name: c.name, argv: c.argv };
  });
}

/** The waiver in the machine store first (a config dir that can't be written refuses it), then the decision. */
async function keep(env: VerifyEnv, o: { r: WaiveRequest; t: Ticket; checks: WaiverCheck[] }): Promise<CheckWaiver> {
  const { r, t, checks } = o;
  const w: CheckWaiver = {
    v: 1,
    id: `W-${randomUUID().slice(0, 8)}`,
    mapId: r.mapId,
    ticketId: t.id,
    ticketKey: t.key,
    attemptId: r.attemptId,
    checks,
    reason: r.reason,
    by: r.person ?? TRAIL_LEAD,
    via: r.via,
    at: Date.now(),
  };
  checkWaivers.add(env.root, w);
  const list = checks.map((c) => c.name).join(', ');
  const decision = await recordDecision(
    env.adapter,
    r.mapId,
    {
      ticketId: t.id,
      ticketKey: t.key,
      question: `Accept ${t.key} without ${list}?`,
      answer: r.reason,
      summary: `Accepted ${t.key} without ${list}: ${firstSentence(r.reason)}`,
      rationale: r.reason,
      decidedBy: TRAIL_LEAD,
      ...(r.person ? { decidedByName: r.person } : {}),
      source: { kind: 'lookout', ref: `waiver:${w.id}`, label: 'Accepted without a check' },
      transcript: [],
    },
    { guard: { via: r.via, highRisk: () => false } },
  );
  checkWaivers.linkDecision(env.root, w, decision.id);
  journalFile(env.root).append({
    v: 1,
    kind: 'waiver',
    at: w.at,
    mapId: r.mapId,
    ticketId: t.id,
    ticketKey: t.key,
    action: 'waived',
    waiver: w.id,
    checks: checks.map((c) => c.name),
    actor: w.by,
    actorKind: 'trail lead',
    reason: r.reason,
  });
  await env.adapter.comment(r.mapId, t.id, TRAIL_LEAD, `**Accepted without ${list}**\n\n${r.reason}\n\nBy ${w.by}.`);
  return { ...w, decisionId: decision.id };
}

/** Back to verifying, and the same submission checked again without the waived checks (verify applies them). */
async function rerunWithout(
  env: VerifyEnv,
  o: { snap: MapSnapshot; t: Ticket; last: VerificationAttempt; w: CheckWaiver; phase: TicketPhase },
) {
  const { snap, t, w } = o;
  await transition(env.adapter, snap.map.id, t.id, {
    event: 'waive',
    actor: w.by,
    actorKind: 'trail lead',
    expect: o.phase,
    reason: `accepted without ${w.checks.map((c) => c.name).join(', ')}: ${w.reason}`,
    journal: env.journal,
  });
  const { info } = levelFor(env.root, snap, t);
  const run = await verify(env, {
    mapId: snap.map.id,
    ticket: { ...t, status: 'verifying' },
    info,
    sub: submissionOf(o.last),
  });
  void run.done.catch(() => {});
  return run.attemptId;
}
