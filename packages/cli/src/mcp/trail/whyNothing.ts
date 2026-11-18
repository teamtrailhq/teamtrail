import type { MapSnapshot, Ticket, TicketType } from '@teamtrail/core';
import { discoverySkipped } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { criteriaReason } from './criteriaGate';
import { briefView } from './discovery';
import type { MainGate } from './mainChecks';
import { heldReason } from './models';
import { noTicketReason } from './noTicketReason';
import type { ReviewGate } from './reviewLimit';
import { waitsReason, type SameModelReview } from './reviewModels';

/** Why nothing was offered: the review limit holds the ready work, checks on main, model matching, or what's in the way. */
export function whyNothing(
  ctx: AgentContext,
  snap: MapSnapshot,
  w: {
    held: Ticket[];
    review: ReviewGate;
    main: MainGate;
    discovery?: TicketType[];
    models: SameModelReview[];
    criteria: Ticket[];
  },
): string {
  if (w.review.reason && w.review.held.length) return w.review.reason;
  if (w.main.reason && w.main.held.length) return w.main.reason;
  if (w.held.length) return heldReason(ctx, snap, w.held);
  if (w.criteria.length) return criteriaReason(w.criteria);
  const waiting = w.models.find((r) => r.waits);
  if (waiting)
    return `${waitsReason(waiting)}, the model you run, so it isn't yours to review. No other ticket is ready.`;
  return noTicketReason(snap, {
    gate: w.discovery,
    next: w.discovery ? briefView(ctx.root, snap)?.next : undefined,
    skipped: discoverySkipped(ctx.root, snap.map.id),
  });
}
