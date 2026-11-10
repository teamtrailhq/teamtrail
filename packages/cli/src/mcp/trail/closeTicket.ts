import {
  attention,
  chooseNext,
  deriveStates,
  OperationError,
  resolve,
  ruleOutOfScope,
  type DecisionMeta,
  type DecisionRecord,
  type DecisionRisk,
  type MapSnapshot,
  type SessionHandle,
  type Ticket,
} from '@teamtrail/core';
import { levelFor } from '@teamtrail/core/agents';
import { assertHumanDecided } from '../remoteGate';
import type { AgentContext } from './agentContext';
import { assertAssumes } from './assumptions';
import { claimTicket } from './claimTicket';
import { closeDecisionMeta } from './closeDecision';
import { submitVerified } from './completion';
import { assertCriteria } from './criteria';
import { checkedAnswers, keepAnswers } from './guides';
import { humanAnswerFor, type HumanAnswer } from './humanAnswer';
import { withReview } from './parallel';
import { checkRisk } from './riskCheck';
import type { CloseInput, WaitControl } from './types';

type Wait = { seconds: number; ctl?: WaitControl };

/** What one close call works on: the trail, the ticket, the closing agent and its session. */
interface Closing {
  ctx: AgentContext;
  input: CloseInput;
  snap: MapSnapshot;
  ticket: Ticket;
  agent: string;
  session: SessionHandle;
  source: { kind: 'agent'; ref: string; label: string };
  /** The policy level of this resolution; a high one only gets here when the human made the call. */
  risk?: DecisionRisk;
  /** The human's answer this close rests on, when it is their decision. */
  human?: HumanAnswer;
}

/** A completion either finished (with any verification fields to report) or stopped early with a result. */
type Completion = { kind: 'closed'; verified: object } | { kind: 'stopped'; result: object };

/**
 * Resolves a ticket (or rules it out), records the decision with this
 * session's transcript and ends the session. When the ticket's completion
 * needs verification, it goes to verifying and is only closed once its
 * checks pass.
 */
export async function closeTicket(ctx: AgentContext, input: CloseInput, wait: Wait) {
  const c = await startClosing(ctx, input);
  const before = frontier(c.snap);
  const ruledOut = input.outcome === 'out_of_scope';
  let verified: object = {};
  if (ruledOut) {
    await ruleOutOfScope(
      ctx.adapter,
      c.snap.map.id,
      { ticketId: c.ticket.id },
      { ...ctx.actor(), reason: input.resolution, author: c.agent, source: c.source },
    );
  } else {
    const done = await complete(c, wait);
    if (done.kind === 'stopped') return withReview(c, used(c, done.result));
    verified = done.verified;
  }
  if (c.human) c.human.usedFor = `the close of ${c.ticket.key}`;
  const decision = await findDecision(c);
  return withReview(c, await finish(c, { before, verified, decision }));
}

/** Finds the ticket, checks this agent may close it, claims it if nobody has, and picks the session. */
async function startClosing(ctx: AgentContext, input: CloseInput): Promise<Closing> {
  const running = ctx.sessions.running();
  const snap = await ctx.resolveTrail(input.trail ?? (running?.info.mapId || undefined));
  const ref = input.ticket ?? (running?.info.mapId === snap.map.id ? running.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`, or claim one first.');
  const agent = await ctx.agentId();
  let ticket = ctx.findTicket(snap, ref);
  assertCloseable(ticket, agent);
  // The human's decision only by their answer to a question asked on this ticket (humanAnswer.ts).
  const human = humanAnswerFor(ctx, { questionId: input.questionId, ticket, category: input.category });
  assertHumanDecided({ remote: ctx.remote, ticket, humanAnswered: !!human });
  const risk = checkRisk({ ...input, root: ctx.root, decidedBy: human?.author ?? agent });
  if (!ticket.assignee && input.outcome !== 'out_of_scope') {
    await claimTicket(ctx, { ticket: ticket.id, trail: snap.map.id });
    const id = ticket.id;
    ticket = (await ctx.load(snap.map.id)).tickets.find((x) => x.id === id)!;
  }
  const current = ctx.sessions.running();
  const session = current?.info.ticketId === ticket.id ? current : await ctx.ensureSession();
  const source = { kind: 'agent' as const, ref: `${session.id}/${ticket.id}`, label: `${agent} session` };
  return { ctx, input, snap, ticket, agent, session, source, risk, human };
}

function assertCloseable(t: Ticket, agent: string) {
  if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
  if (t.type === 'review') throw new OperationError(`${t.key} is a review: answer it with submit_review`);
  if (t.assignee && t.assignee !== agent) throw new OperationError(`${t.key} is claimed by ${t.assignee}`);
  if (t.status === 'verifying')
    throw new OperationError(`${t.key} is being verified: call verification_status ${t.key} for the result`);
}

/** Resolves the ticket: through verification when its level asks for checks, directly otherwise. */
async function complete(c: Closing, wait: Wait): Promise<Completion> {
  const { ctx, input, snap, ticket: t, session: s } = c;
  const log = ctx.sessions.transcript(s.id) ?? [];
  assertAssumes(snap, input.assumes);
  const meta = closeDecisionMeta({ ...c, ...input }, log);
  const wantsTranscript = input.postTranscript && log.length > 0;
  const transcript = wantsTranscript ? log.map((e) => `**${e.author}:** ${e.text}`).join('\n\n') : undefined;
  const { info } = levelFor(ctx.root, snap, t);
  assertCriteria(ctx.root, snap, t, info.level);
  await keepAnswers(ctx, {
    snap,
    ticket: t,
    checked: checkedAnswers(ctx, { snap, ticket: t, given: input.checklist }),
  });
  if (info.level === 'off') {
    await resolveDirectly(c, { meta, transcript });
  } else {
    s.step(4, `checks: ${info.checks.join(', ') || 'none configured'}`);
    const sub = {
      agent: c.agent,
      sessionId: s.id,
      resolution: input.resolution,
      summary: input.summary,
      rationale: input.rationale,
      alternatives: input.alternatives,
      noCodeReason: input.noCodeReason,
      pr: input.pr,
      criteria: input.criteria,
      decision: meta,
      transcript,
      remote: ctx.remote,
    };
    const r = await submitVerified(
      ctx,
      { snap, ticket: t, info, sub },
      { seconds: input.waitSeconds ?? wait.seconds, ctl: wait.ctl ?? {} },
    );
    if (r.status !== 'done') {
      const stillRunning = 'pending' in r;
      if (!stillRunning && s.info.ticketId === t.id) ctx.sessions.end(true, `${t.key} ${r.attempt} · ${r.status}`);
      return { kind: 'stopped', result: { ticket: t.key, ...r } };
    }
    if (s.info.mode === 'work') s.step(5);
    return { kind: 'closed', verified: r };
  }
  if (s.info.mode === 'work') s.step(5);
  return { kind: 'closed', verified: {} };
}

/** A completion that waits on checks or a review has still used the human's answer. */
function used<R>(c: Closing, result: R) {
  if (c.human) c.human.usedFor = `the completion of ${c.ticket.key}`;
  return result;
}

async function resolveDirectly(c: Closing, parts: { meta: DecisionMeta; transcript?: string }) {
  const { ctx, input, snap, ticket: t, session: s } = c;
  if (s.info.mode === 'research') s.step(3, `${t.key} decided`);
  else s.step(4, `${parts.transcript ? 'transcript + ' : ''}comment + close + record decision`);
  const answer = { answer: input.resolution, summary: input.summary, author: c.agent };
  await resolve(ctx.adapter, snap.map.id, t.id, {
    ...ctx.actor(),
    ...answer,
    transcript: parts.transcript,
    decision: parts.meta,
  });
}

async function findDecision(c: Closing): Promise<DecisionRecord | undefined> {
  const all = await c.ctx.decisions(c.snap.map.id);
  return all.find((d) => d.ticketId === c.ticket.id && d.source.ref === c.source.ref);
}

/** Ticket ids that can be picked up now. */
function frontier(snap: MapSnapshot): Set<string> {
  const states = deriveStates(snap.tickets, snap.map.mode);
  return new Set([...states].filter(([, v]) => v === 'frontier').map(([k]) => k));
}

/** Releases the lease, ends the session, and reports what opened up and what comes next. */
async function finish(c: Closing, done: { before: Set<string>; verified: object; decision?: DecisionRecord }) {
  const { ctx, input, ticket: t, session: s } = c;
  ctx.leases.drop(c.snap.map.id, t.id);
  const after = await ctx.load(c.snap.map.id);
  const nowOpen = frontier(after);
  const unblocked = after.tickets.filter((x) => nowOpen.has(x.id) && !done.before.has(x.id));
  const verb = input.outcome === 'out_of_scope' ? 'ruled out' : 'decided';
  if (s.info.ticketId === t.id) ctx.sessions.end(true, `${t.key} ${verb} · session closed`);
  const next = chooseNext(after);
  const open = after.tickets.filter((x) => x.state === 'open').length;
  const d = done.decision;
  return {
    closed: t.key,
    outcome: input.outcome ?? 'completed',
    ...done.verified,
    decision: d ? { id: d.id, summary: d.summary, decidedBy: d.decidedBy } : null,
    unblocked: unblocked.map((x) => ({ key: x.key, title: x.title, type: x.type })),
    next: next ? { key: next.key, title: next.title, type: next.type, attention: attention(next) } : null,
    trailDone: open === 0,
  };
}
