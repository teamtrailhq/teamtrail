import {
  allowedTypes,
  attention,
  OperationError,
  promoteToTicket,
  release,
  setTicketGuide,
  type Ticket,
  type TicketType,
} from '@teamtrail/core';
import { levelFor, listGuides, recordCharted } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { criteriaView, saveCriteria, type CriterionInput } from './criteria';
import { briefView, claimable } from './discovery';
import { assertGuide, outsideGuides } from './guides';
import { knowledgeFor } from './knowledge';
import { heldReason, pickNext, tierFields } from './models';
import { noTicketReason } from './noTicketReason';
import { assertOwnClaim } from './ownClaim';
import { recoverStalled } from './recoverStalled';
import { frozenOn } from './reroutes';
import { ownReviews } from './reviews';
import { ticketInfo } from './ticketInfo';

export async function nextTicket(
  ctx: AgentContext,
  input: { trail?: string; types?: TicketType[]; guides?: string[] } = {},
) {
  const recovered = await recoverStalled(ctx);
  const snap = await ctx.resolveTrail(input.trail);
  const gate = claimable(ctx.root, snap.map.id);
  const types = gate ? (input.types ?? gate).filter((x) => gate.includes(x)) : input.types;
  const exclude = [
    ...(await ownReviews(ctx, snap, await ctx.agentId())),
    ...frozenOn(ctx, snap.map.id).keys(),
    ...outsideGuides(snap, input.guides),
  ];
  const { ticket: t, held } = pickNext(ctx, snap, { types, exclude });
  const extra = recovered.length ? { recovered } : {};
  if (t)
    return {
      ticket: ticketInfo(ctx.root, snap, t, await ctx.decisions(snap.map.id)),
      ...tierFields(ctx, snap, t),
      knowledge: knowledgeFor(ctx.root, snap, t),
      ...extra,
    };
  const reason = held.length
    ? heldReason(ctx, snap, held)
    : noTicketReason(snap, { gate, next: gate ? briefView(ctx.root, snap)?.next : undefined });
  return { ticket: null, reason, ...extra };
}

export async function releaseTicket(ctx: AgentContext, input: { ticket?: string; trail?: string; reason?: string }) {
  const snap = await ctx.resolveTrail(input.trail);
  const ref = input.ticket ?? ctx.sessions.running()?.info.ticketId;
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`.');
  const t = ctx.findTicket(snap, ref);
  assertOwnClaim(ctx, { mapId: snap.map.id, ticket: t, agent: await ctx.agentId() });
  await release(ctx.adapter, snap.map.id, t.id, { ...ctx.actor(), reason: input.reason });
  ctx.leases.drop(snap.map.id, t.id);
  if (ctx.sessions.running()?.info.ticketId === t.id)
    ctx.sessions.end(true, `Released ${t.key}${input.reason ? ` · ${input.reason}` : ''}`);
  return { released: t.key };
}

/**
 * Who added a ticket after the trail was charted, and while working on what. A new ticket can do work another one
 * holds back (a task beside a junction waiting on the human), so where it came from stays on the ticket.
 */
function addedLine(ctx: AgentContext, hitl?: boolean) {
  const working = ctx.sessions.running()?.info.ticketId;
  const during = working ? ` while working ${ctx.keyOf(working)}` : '';
  const who = hitl ? 'for the human to decide' : 'for agents, without the human';
  return `Added by ${ctx.sessions.running()?.info.agent ?? 'an agent'}${during}, ${who}.`;
}

export async function addTicket(
  ctx: AgentContext,
  input: {
    trail?: string;
    title: string;
    type: TicketType;
    body?: string;
    hitl?: boolean;
    blockedBy?: string[];
    fromUnspecified?: string;
    criteria?: CriterionInput[];
    guide?: string;
  },
) {
  const snap = await ctx.resolveTrail(input.trail);
  if (input.guide) assertGuide(listGuides(ctx.root), input.guide, input.type);
  if (!allowedTypes(snap.map.mode).includes(input.type))
    throw new OperationError(`${input.type} tickets are disabled on plan-only trails`);
  const s = await ctx.ensureSession();
  const blockers = (input.blockedBy ?? []).map((b) => ctx.findTicket(snap, b).id);
  let t: Ticket;
  if (input.fromUnspecified) {
    t = await promoteToTicket(ctx.adapter, snap.map.id, input.fromUnspecified, {
      type: input.type,
      hitl: input.hitl,
      title: input.title,
      body: input.body,
      blockedBy: blockers,
    });
    s.log(`promoted to ${t.key} · ${input.fromUnspecified}`, 'ok');
  } else {
    t = await ctx.adapter.createTicket(snap.map.id, {
      title: input.title,
      type: input.type,
      hitl: input.hitl,
      body: `${input.body ?? ''}\n\nPart of trail ${snap.map.key}.`.trim(),
    });
    for (const b of blockers) await ctx.adapter.addBlocking(snap.map.id, b, t.id);
  }
  recordCharted(ctx.root, snap.map.id, [t.id], { agent: await ctx.agentId(), origin: ctx.origin });
  await ctx.adapter.comment(snap.map.id, t.id, await ctx.agentId(), addedLine(ctx, attention(t) === 'hitl'));
  if (input.guide) await setTicketGuide(ctx.adapter, { mapId: snap.map.id, ticketId: t.id }, input.guide, 'agent');
  if (input.criteria?.length) saveCriteria(ctx.root, snap.map, t, input.criteria);
  const fresh = await ctx.load(snap.map.id);
  const created = fresh.tickets.find((x) => x.id === t.id)!;
  return {
    ticket: ticketInfo(ctx.root, fresh, created),
    criteria: criteriaView(ctx.root, fresh, created, levelFor(ctx.root, fresh, created).info.level),
  };
}
