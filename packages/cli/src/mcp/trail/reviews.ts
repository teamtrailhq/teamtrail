import {
  OperationError,
  type ChecklistAnswer,
  type MapSnapshot,
  type Ticket,
  type VerificationVerdict,
  vendorOf,
} from '@teamtrail/core';
import { readAgentDocs, readAttempts, reviewConflict, submitReview } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { checkedAnswers, keepAnswers } from './roles';

/** Why this agent may not take review ticket `r`, or undefined. */
function conflictOf(ctx: AgentContext, snap: MapSnapshot, r: Ticket, agent: string) {
  const t = snap.tickets.find((x) => x.id === r.reviewOf);
  return t ? reviewConflict(ctx.root, snap.map.id, t, { agent, sessionIds: ctx.sessionIds }) : undefined;
}

/** Review tickets of work this agent did: never offered to it. */
export const ownReviews = async (ctx: AgentContext, snap: MapSnapshot, agent: string) => [
  ...snap.tickets
    .filter((r) => r.type === 'review' && r.state === 'open' && conflictOf(ctx, snap, r, agent))
    .map((r) => r.id),
  ...(await deferredReviews(ctx, snap, agent)),
];

/** How long a review waits for another vendor's agent before any independent agent may take it. */
export const CROSS_VENDOR_WAIT_MS = 10 * 60_000;

/**
 * Reviews this agent leaves to another vendor for now: the work was done by an agent of its own vendor, an agent of
 * another vendor is connected, and the review hasn't waited long. Claude reviews Codex and vice versa when both run.
 */
export async function deferredReviews(ctx: AgentContext, snap: MapSnapshot, agent: string, now = Date.now()) {
  const mine = vendorOf(agent);
  const others = new Set(
    (await readAgentDocs(ctx.root))
      .filter((d) => d.session.status === 'running')
      .map((d) => vendorOf(d.session.agent))
      .filter((v) => v !== mine),
  );
  if (!others.size) return [];
  return snap.tickets
    .filter((r) => {
      if (r.type !== 'review' || r.state !== 'open' || now - r.createdAt > CROSS_VENDOR_WAIT_MS) return false;
      const worker = readAttempts(ctx.root, snap.map.id, r.reviewOf ?? '').at(-1)?.agent;
      return !!worker && vendorOf(worker) === mine;
    })
    .map((r) => r.id);
}

export function assertMayReview(ctx: AgentContext, snap: MapSnapshot, t: Ticket, agent: string) {
  const conflict = t.type === 'review' ? conflictOf(ctx, snap, t, agent) : undefined;
  if (conflict) throw new OperationError(`You cannot take ${t.key}: ${conflict}.`);
}

export async function submitReviewTool(
  ctx: AgentContext,
  input: {
    trail?: string;
    ticket?: string;
    verdict: VerificationVerdict['verdict'];
    summary: string;
    findings?: VerificationVerdict['findings'];
    checklist?: ChecklistAnswer[];
  },
) {
  const s = ctx.sessions.running();
  const snap = await ctx.resolveTrail(input.trail ?? (s?.info.mapId || undefined));
  const ref = input.ticket ?? (s?.info.mapId === snap.map.id ? s.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which review? Pass `ticket`, or claim a review ticket first.');
  const review = ctx.findTicket(snap, ref);
  const agent = await ctx.agentId();
  const checked = checkedAnswers(ctx, { snap, ticket: review, given: input.checklist });
  const r = await submitReview(ctx.verifyEnv(), {
    mapId: snap.map.id,
    reviewId: review.id,
    agent,
    sessionIds: ctx.sessionIds,
    sessionId: s?.id,
    verdict: input.verdict,
    summary: input.summary,
    findings: input.findings,
    ...(checked ? { role: checked.role, checklist: checked.answers } : {}),
  });
  await keepAnswers(ctx, { snap, ticket: review, checked });
  ctx.leases.drop(snap.map.id, review.id);
  if (s?.info.ticketId === review.id) ctx.sessions.end(true, `Reviewed ${review.key}: ${input.verdict}`);
  const reviewed = snap.tickets.find((x) => x.id === review.reviewOf)!;
  const next = {
    done: `${reviewed.key} is done.`,
    rework: `${reviewed.key} went back for rework with your findings.`,
    blocked: `${reviewed.key} waits on the human.`,
    verifying: r.attemptId
      ? `The code changed since its checks passed, so they run again (${r.attemptId}).`
      : `${reviewed.key} waits for the human to approve.`,
  }[r.phase as 'done'];
  const worker = readAttempts(ctx.root, snap.map.id, reviewed.id).at(-1)?.agent;
  return {
    review: review.key,
    verdict: r.verdict.id,
    ticket: reviewed.key,
    phase: r.phase,
    next,
    ...(worker ? { crossVendor: vendorOf(worker) !== vendorOf(agent) } : {}),
  };
}
