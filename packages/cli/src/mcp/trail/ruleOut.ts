import { OperationError, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { listReroutes } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { assertCloseable } from './assertCloseable';
import { frozenOn, proposeRerouteOp } from './reroutes';
import type { CloseInput } from './types';

/**
 * close_ticket with outcome "out_of_scope". Ruling a ticket out cancels it and unblocks whatever waited on it: the
 * same effect as a reroute's cancel_ticket, and the human's call. An agent never cancels a ticket itself, whatever
 * answers it holds: an answer to a question may say anything, "don't drop it" included. The call always becomes a
 * rule-out proposal, which the human approves in one click. Rule-outs have their own lane (rerouteLimits.ts): they
 * never replace the agent's plan proposal, and asking again for the same ticket returns the pending one.
 */
export async function ruleOut(ctx: AgentContext, input: CloseInput) {
  const running = ctx.sessions.running();
  const snap = await ctx.resolveTrail(input.trail ?? (running?.info.mapId || undefined));
  const ref = input.ticket ?? (running?.info.mapId === snap.map.id ? running.info.ticketId : undefined);
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`, or claim one first.');
  const ticket = ctx.findTicket(snap, ref);
  assertCloseable(ticket, await ctx.agentId());
  const frozenBy = frozenOn(ctx, snap.map.id).get(ticket.id);
  const own = frozenBy && isRuleOutOf(ctx, snap.map.id, frozenBy, ticket.id);
  if (frozenBy && !own)
    throw new OperationError(`${ticket.key} is frozen by reroute proposal ${frozenBy}, waiting on the human`);
  return proposeRuleOut(ctx, { snap, ticket, reason: input.resolution });
}

const isRuleOutOf = (ctx: AgentContext, mapId: string, id: string, ticketId: string) =>
  listReroutes(ctx.root, mapId).some(
    (p) =>
      p.id === id && p.lane === 'rule-out' && p.changes.some((c) => c.op === 'cancel_ticket' && c.ticket === ticketId),
  );

async function proposeRuleOut(ctx: AgentContext, at: { snap: MapSnapshot; ticket: Ticket; reason: string }) {
  const proposal = await proposeRerouteOp(ctx, {
    trail: at.snap.map.id,
    lane: 'rule-out',
    reason: `Rule ${at.ticket.key} out of scope`,
    evidence: at.reason,
    changes: [{ op: 'cancel_ticket', ticket: at.ticket.id, reason: at.reason }],
  });
  const id = 'id' in proposal ? proposal.id : '';
  return {
    closed: null,
    outcome: 'proposed',
    proposal,
    note: `Ruling ${at.ticket.key} out cancels it and unblocks what waits on it: that is the human's call, so it is reroute proposal ${id}, which they approve or dismiss in one click. Keep working on other tickets; reroute_status shows their decision.`,
  };
}
