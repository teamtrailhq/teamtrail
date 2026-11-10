import { OperationError, ruleOutOfScope, type MapSnapshot, type Ticket } from '@teamtrail/core';
import type { AgentContext } from './agentContext';
import { assertClaimable } from './discovery';
import { humanAnswerFor, release, spend } from './humanAnswer';
import { assertOwnClaim } from './ownClaim';
import { frozenOn, proposeRerouteOp } from './reroutes';
import type { CloseInput } from './types';

/**
 * close_ticket with outcome "out_of_scope". Ruling a ticket out cancels it and unblocks whatever waited on it:
 * the same effect as a reroute's cancel_ticket, so it is the human's call. An agent rules a ticket out directly
 * only when it holds the claim and the human said so, in answer to a question asked on that ticket (not as an
 * fyi). Without that, the call becomes a reroute proposal to cancel the ticket, which the human approves or not.
 * A ticket another pending proposal freezes, or that the discovery gate holds back, is never ruled out here.
 */
export async function ruleOut(ctx: AgentContext, input: CloseInput) {
  const running = ctx.sessions.running();
  const snap = await ctx.resolveTrail(input.trail ?? (running?.info.mapId || undefined));
  const ref = input.ticket ?? (running?.info.mapId === snap.map.id ? running.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`, or claim one first.');
  const ticket = ctx.findTicket(snap, ref);
  const agent = await ctx.agentId();
  if (ticket.state === 'closed') throw new OperationError(`${ticket.key} is already closed`);
  const frozenBy = frozenOn(ctx, snap.map.id).get(ticket.id);
  if (frozenBy) throw new OperationError(`${ticket.key} is frozen by reroute proposal ${frozenBy}, waiting on the human`);
  const mine = ticket.assignee === agent;
  if (mine) assertOwnClaim(ctx, { mapId: snap.map.id, ticket, agent });
  const human = mine ? humanAnswerFor(ctx, { questionId: input.questionId, ticket, hitl: true }) : undefined;
  if (!human) return proposeCancel(ctx, { snap, ticket, reason: input.resolution });
  try {
    assertClaimable(ctx.root, snap.map.id, ticket);
    const done = await ruledOutByHuman(ctx, { snap, ticket, agent, reason: input.resolution, by: human.author });
    spend(human, `ruling ${ticket.key} out`);
    return done;
  } catch (e) {
    release(human);
    throw e;
  }
}

/** The human said to drop it: cancelled, with their answer behind it. */
async function ruledOutByHuman(
  ctx: AgentContext,
  at: { snap: MapSnapshot; ticket: Ticket; agent: string; reason: string; by: string },
) {
  const { snap, ticket: t, agent } = at;
  const session = ctx.sessions.running();
  await ruleOutOfScope(
    ctx.adapter,
    snap.map.id,
    { ticketId: t.id },
    {
      ...ctx.actor(),
      reason: `${at.reason} (the human said so: ${at.by})`,
      author: agent,
      source: { kind: 'agent', ref: `${session?.id ?? agent}/${t.id}`, label: `${agent} session` },
    },
  );
  ctx.leases.drop(snap.map.id, t.id);
  if (session?.info.ticketId === t.id) ctx.sessions.end(true, `${t.key} ruled out · session closed`);
  return { closed: t.key, outcome: 'out_of_scope', ruledOutWith: at.by };
}

/** No answer from the human: ruling it out becomes a proposal to cancel it, frozen until they decide. */
async function proposeCancel(ctx: AgentContext, at: { snap: MapSnapshot; ticket: Ticket; reason: string }) {
  const proposal = await proposeRerouteOp(ctx, {
    trail: at.snap.map.id,
    reason: `Rule ${at.ticket.key} out of scope`,
    evidence: at.reason,
    changes: [{ op: 'cancel_ticket', ticket: at.ticket.id, reason: at.reason }],
  });
  return {
    closed: null,
    outcome: 'proposed',
    proposal,
    note: `Ruling ${at.ticket.key} out cancels it and unblocks what waits on it: that is the human's call. It is now reroute proposal ${'id' in proposal ? proposal.id : ''} for them to approve. To rule it out yourself, hold the claim, ask_human on it and close it once they agree.`,
  };
}
