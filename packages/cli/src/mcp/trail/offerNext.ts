import { assertNotArchived, attention, type MapSnapshot, type Ticket, type TicketType } from '@teamtrail/core';
import type { AgentContext } from './agentContext';
import { criteriaGate } from './criteriaGate';
import { claimable } from './discovery';
import { outsideGuides } from './guides';
import { mainChecksField, mainGate, type MainGate } from './mainChecks';
import { pickNext } from './models';
import { frozenOn } from './reroutes';
import { reviewGate, reviewLimitField, type ReviewGate } from './reviewLimit';
import { sameModelReviews, type SameModelReview } from './reviewModels';
import { ownReviews } from './reviews';
import { whyNothing } from './whyNothing';

/** Every gate a claim of `snap`'s tickets passes, as read for one offer. */
export interface ClaimGates {
  /** Ticket types the discovery gate lets through (`undefined`: any). */
  discovery?: TicketType[];
  review: ReviewGate;
  main: MainGate;
  models: SameModelReview[];
  criteria: Ticket[];
  /** Ticket id → the reroute proposal freezing it. */
  frozen: Map<string, string>;
}

/** What to offer an agent: a ticket it may claim now, or why there is none; the fields every offer carries. */
export interface Offer {
  ticket?: Ticket;
  /** Why nothing is offered; missing when a ticket is. */
  reason?: string;
  /** `reviewLimit` and `mainChecks`, for the agent to pass on to the human. */
  fields: Record<string, unknown>;
  /** Missing on an archived trail, where nothing is read. */
  gates?: ClaimGates;
}

/** The archived trail's refusal, as `claim` words it. */
function archivedReason(snap: MapSnapshot) {
  try {
    assertNotArchived(snap.map);
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * The one chooser behind every tool that suggests work (next_ticket and its wait, claim_ticket without a ticket,
 * resume_trail, start_trail, close_ticket's `next`): the best ready ticket that `claim_ticket` takes now, past the
 * discovery gate, the review limit, checks on main, reroute freezes, criteria before work, own and deferred reviews,
 * model matching and the agent's guides. With nothing to offer, the reason next_ticket gives.
 */
export async function offerNext(
  ctx: AgentContext,
  snap: MapSnapshot,
  input: { types?: TicketType[]; guides?: string[] } = {},
): Promise<Offer> {
  const archived = archivedReason(snap);
  if (archived) return { reason: archived, fields: {} };
  const gates = await readGates(ctx, snap);
  const { discovery } = gates;
  const types = discovery ? (input.types ?? discovery).filter((x) => discovery.includes(x)) : input.types;
  const exclude = [
    ...gates.criteria.map((c) => c.id),
    ...(await ownReviews(ctx, snap, await ctx.agentId())),
    ...gates.models.filter((r) => r.waits).map((r) => r.ticket.id),
    ...gates.frozen.keys(),
    ...outsideGuides(snap, input.guides),
    ...gates.review.held.map((h) => h.id),
    ...gates.main.held.map((h) => h.id),
  ];
  const later = gates.models.map((r) => r.ticket.id);
  const { ticket, held } = pickNext(ctx, snap, { types, exclude, later });
  const fields = { ...reviewLimitField(gates.review), ...mainChecksField(gates.main) };
  if (ticket) return { ticket, fields, gates };
  return { reason: whyNothing(ctx, snap, { ...gates, held }), fields, gates };
}

export async function readGates(ctx: AgentContext, snap: MapSnapshot): Promise<ClaimGates> {
  return {
    discovery: claimable(ctx.root, snap.map.id),
    review: await reviewGate(ctx, snap),
    main: await mainGate(ctx, snap),
    models: await sameModelReviews(ctx, snap),
    criteria: criteriaGate(ctx.root, snap),
    frozen: frozenOn(ctx, snap.map.id),
  };
}

/** `next` in a result that names the offered ticket only (close_ticket), or `nextReason` when there is none. */
export function nextInBrief(offer: Offer) {
  const t = offer.ticket;
  if (!t) return { next: null, nextReason: offer.reason };
  return { next: { key: t.key, title: t.title, type: t.type, attention: attention(t) } };
}
