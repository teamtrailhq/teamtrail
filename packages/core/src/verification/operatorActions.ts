import { staleAction } from '../evidence/stale';
import type { AnswerVia } from '../model/answerVia';
import type { TicketPhase, VerificationLevel } from '../model/lifecycle';
import type { VerdictKind, VerificationAttempt } from '../model/verification';
import { withdrawReviews } from '../planning/lifecycle/reviewTicket';
import { setVerification } from '../planning/lifecycle/setVerification';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { resolve } from '../planning/operations/resolve';
import { needsLookout } from '../policy/needsLookout';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';
import { recordLevel, recordTypes } from './approvedLevel';
import { trustedChecks } from './checksApproval';
import { DEFAULT_CONFIG } from './config';
import { readAttempts, writeVerdict } from './evidenceStore';
import { rerunChecks } from './operatorRerun';
import { CHECK_RUNNER, type VerifyEnv } from './verifyCompletion';

export type OperatorAction = 'rerun' | 'approve' | 'accept' | 'rework' | 'unblock' | 'level';

export interface OperatorRequest {
  action: OperatorAction;
  mapId: string;
  /** Unset only for `level`, which then sets the trail level. */
  ticketId?: string;
  by: string;
  reason?: string;
  /** `unblock`: where the ticket goes. */
  to?: Extract<TicketPhase, 'ready' | 'rework'>;
  /** `level`: `null` clears it (the ticket follows the trail, the trail is off). */
  level?: VerificationLevel | null;
  /** Where the trail lead acted, when not the Lookout: `slack` can't approve high-risk work (lookoutGuard.ts). */
  via?: AnswerVia;
}

/** Actions that override what the checks or a reviewer found, so the trail lead must say why. */
const NEEDS_REASON = new Set<OperatorAction>(['accept', 'rework', 'unblock']);

/**
 * What the trail lead can do to a ticket under verification, from the command
 * center. Every state change goes through `transition()` as the trail lead, and
 * approvals, overrides and rework notes are kept as verdicts next to the attempts.
 */
export async function operatorAction(env: VerifyEnv, r: OperatorRequest): Promise<{ attemptId?: string }> {
  const reason = r.reason?.trim();
  if (NEEDS_REASON.has(r.action) && !reason) throw new OperationError(`${r.action} needs a reason`);
  if (r.action === 'level') {
    if (r.level === undefined) throw new OperationError('"level" is required');
    await setVerification(env.adapter, { mapId: r.mapId, ticketId: r.ticketId }, r.level, 'trail lead');
    // set by the trail lead on this machine: a later edit of the file below this level waits for them
    recordLevel(env.root, { mapId: r.mapId, ticketId: r.ticketId }, r.level);
    // and the types its level applies by, so a type edited in a file later doesn't move a ticket out of it
    const { tickets } = await env.adapter.loadMap(r.mapId);
    recordTypes(env.root, r.mapId, r.ticketId ? tickets.filter((t) => t.id === r.ticketId) : tickets);
    return {};
  }
  if (!r.ticketId) throw new OperationError('"ticketId" is required');
  const a: Act = {
    env,
    r,
    ticketId: r.ticketId,
    reason,
    operator: { actor: r.by, actorKind: 'trail lead', reason, journal: env.journal },
    last: readAttempts(env.root, r.mapId, r.ticketId).at(-1),
  };
  switch (r.action) {
    case 'rerun':
      return rerun(a);
    case 'approve':
    case 'accept':
      return decide(a, r.action);
    case 'rework':
      return rework(a);
    case 'unblock':
      return unblock(a);
    default: {
      const unhandled: never = r.action;
      throw new OperationError(`unknown action ${unhandled}`);
    }
  }
}

/** One trail lead action on one ticket, with the ticket's last attempt. */
interface Act {
  env: VerifyEnv;
  r: OperatorRequest;
  ticketId: string;
  reason?: string;
  operator: { actor: string; actorKind: 'trail lead'; reason?: string; journal: VerifyEnv['journal'] };
  last?: VerificationAttempt;
}

async function rerun({ env, r, ticketId, reason }: Act) {
  const run = await rerunChecks(env, { mapId: r.mapId, ticketId, by: r.by, reason });
  void run.done.catch(() => {});
  return { attemptId: run.attemptId };
}

/** Approve a pass, or accept the work despite what the checks or a reviewer found. */
async function decide(a: Act, action: 'approve' | 'accept') {
  const { env, r, ticketId, reason, last } = a;
  const answer = last?.resolution ?? reason;
  if (!answer) throw new OperationError('nothing was submitted: say what is accepted');
  if (action === 'approve' && last) await assertCurrent(env, last);
  const author = last?.agent ?? r.by;
  // From Slack (said, or by an actor id `slack:…`), work that touched high-risk files or a high-risk question waits
  // for the Lookout; the guard fails closed when there is no evidence of what changed.
  const via = r.via ?? (r.by.startsWith('slack:') ? 'slack' : undefined);
  const highRisk = async (mapId: string, id: string) =>
    needsLookout.approval(env.root, { mapId, ticketId: id, attemptId: last?.id }) ||
    (await ticketNeedsLookout(env.root, mapId, id));
  await resolve(env.adapter, r.mapId, ticketId, {
    ...a.operator,
    event: action,
    answer,
    summary: last?.summary,
    author,
    guard: { via, highRisk },
  });
  verdict(a, 'PASS', reason ?? (action === 'approve' ? 'approved' : 'accepted'));
  await withdraw(a);
  return {};
}

/** An approval only counts for the code that was checked. */
async function assertCurrent(env: VerifyEnv, last: VerificationAttempt) {
  // the approved config: an unapproved edit to verification.json changes nothing the trail lead sees as current
  const config = trustedChecks(env.root).config.config ?? DEFAULT_CONFIG;
  const s = await staleAction(env.root, config, last);
  if (s.action === 'reverify')
    throw new OperationError(`${last.id} no longer matches the code (${s.check.reason}): re-run checks first`);
}

async function rework(a: Act) {
  const { env, r, ticketId, reason = '' } = a;
  await transition(env.adapter, r.mapId, ticketId, { ...a.operator, event: 'reject', to: 'rework' });
  await env.adapter.comment(r.mapId, ticketId, r.by, `**Sent back to rework**\n\n${reason}`);
  verdict(a, 'FAIL', reason);
  await withdraw(a);
  return {};
}

async function unblock({ env, r, ticketId, operator }: Act) {
  if (r.to !== 'ready' && r.to !== 'rework') throw new OperationError('unblock needs "to": ready or rework');
  await transition(env.adapter, r.mapId, ticketId, { ...operator, event: 'unblock', to: r.to });
  return {};
}

/** The trail lead's decision, kept next to the attempt it is about. */
function verdict({ env, r, ticketId, last }: Act, kind: VerdictKind, summary: string) {
  if (!last) return;
  writeVerdict(env.root, {
    v: 1,
    mapId: r.mapId,
    ticketId,
    attemptId: last.id,
    by: r.by,
    byKind: 'trail lead',
    verdict: kind,
    summary,
    findings: [],
    at: Date.now(),
  });
}

/** Open reviews of a ticket the trail lead decided have nothing left to decide. */
async function withdraw({ env, r, ticketId }: Act) {
  await withdrawReviews(env.adapter, await env.adapter.loadMap(r.mapId), ticketId, {
    actor: CHECK_RUNNER,
    reason: `${r.by} decided it (${r.action})`,
    journal: env.journal,
  });
}
