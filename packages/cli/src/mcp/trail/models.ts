import {
  effectiveTiers,
  orderNext,
  rankForSession,
  tierOfModel,
  tierOfTicket,
  tierRank,
  type MapSnapshot,
  type SessionTier,
  type Ticket,
  type TicketType,
} from '@teamtrail/core';
import { readModelsConfig } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * Model matching for one connected agent: which tier the model it runs on is, and which ready ticket fits it.
 * Teamtrail only reads the model from the agent's own logs; it never picks or switches one.
 */

/** This agent's tier: the model of its latest call in its log (else its session's usage), through models.json. */
export function sessionTier(ctx: AgentContext): SessionTier {
  const measured = ctx.opts.usage?.model?.();
  const model = measured ?? ctx.sessions.current?.info.usage?.models?.at(-1);
  return tierOfModel(model, readModelsConfig(ctx.root).models);
}

/** Records the model and tier on the running session, for the Lookout's sessions list and the attention queue. */
export function stampModel(ctx: AgentContext) {
  const s = ctx.sessions.running();
  if (!s) return;
  const t = sessionTier(ctx);
  s.setModel(t.model, t.tier);
}

const matchingOn = (snap: MapSnapshot) => snap.map.modelMatching?.enabled === true;

/**
 * The ticket to offer this agent next. With matching off it's `chooseNext`'s pick. With it on, the best ticket at
 * the agent's tier, else a lower one; `held` lists ready tickets left for a stronger model.
 */
export function pickNext(
  ctx: AgentContext,
  snap: MapSnapshot,
  opts: { types?: TicketType[]; exclude?: string[] },
): { ticket?: Ticket; held: Ticket[] } {
  const order = orderNext(snap, opts);
  if (!matchingOn(snap)) return { ticket: order[0], held: [] };
  const tier = sessionTier(ctx).tier;
  const fits = rankForSession(order, tier, snap.map);
  return { ticket: fits[0], held: order.filter((t) => !fits.includes(t)) };
}

/** Why nothing fits: the ready tickets wait for a stronger model; an explicit claim still takes one. */
export function heldReason(ctx: AgentContext, snap: MapSnapshot, held: Ticket[]): string {
  const s = sessionTier(ctx);
  const list = held
    .slice(0, 5)
    .map((t) => `${t.key} (${t.type}, ${tierOfTicket(t, snap.map)})`)
    .join(', ');
  return `No ready ticket fits this session: ${list} ${held.length === 1 ? 'is' : 'are'} set for a stronger model, and this session runs ${s.tier} (${s.reason}). They wait for a session on a stronger model. To take one anyway, claim it by key and tell the human.`;
}

/**
 * `tier` on claim and next results while matching is on, and on an explicit claim of a higher-tier ticket a
 * `tierNote` the agent passes on to the human. Nothing while matching is off.
 */
export function tierFields(ctx: AgentContext, snap: MapSnapshot, t: Ticket, explicit = false) {
  if (!matchingOn(snap)) return {};
  const s = sessionTier(ctx);
  const ticket = tierOfTicket(t, snap.map);
  const tier = { session: s.tier, ticket, ...(s.model ? { model: s.model } : {}) };
  if (!explicit || tierRank(ticket) <= tierRank(s.tier)) return { tier };
  return {
    tier,
    tierNote: `This ticket is set for ${ticket}; this session runs ${s.tier}. Tell the human you took it anyway.`,
  };
}

/** `modelMatching` in status and resume_trail: on or off, the trail's tier per ticket type, and this session's tier. */
export function matchingView(ctx: AgentContext, snap: MapSnapshot) {
  const s = sessionTier(ctx);
  return {
    enabled: matchingOn(snap),
    tiers: effectiveTiers(snap.map),
    session: { tier: s.tier, ...(s.model ? { model: s.model } : {}), reason: s.reason },
  };
}
