import type { TrackerAdapter } from '../../adapters/adapter';
import type { Journal } from '../../model/lifecycle';
import type { MapSnapshot, Ticket } from '../../model/types';
import { transition } from './transition';

/** Open review tickets of `ticketId`. */
export const openReviews = (snap: MapSnapshot, ticketId: string) =>
  snap.tickets.filter((t) => t.type === 'review' && t.reviewOf === ticketId && t.state === 'open');

/**
 * A `review` ticket for `reviewOf`; only Teamtrail creates them, when checks pass at a review level. `role` is the
 * reviewer role when the trail's team has one.
 */
export async function createReviewTicket(
  adapter: TrackerAdapter,
  mapId: string,
  input: { reviewOf: string; title: string; body: string; role?: string },
): Promise<Ticket> {
  const t = await adapter.createTicket(mapId, { title: input.title, type: 'review', body: input.body });
  const role = input.role ? { role: input.role } : {};
  await adapter.setMeta(mapId, t.id, { reviewOf: input.reviewOf, ...role });
  return { ...t, reviewOf: input.reviewOf, ...role };
}

/** Cancels the open review tickets of a ticket whose review no longer applies. */
export async function withdrawReviews(
  adapter: TrackerAdapter,
  snap: MapSnapshot,
  ticketId: string,
  by: { actor: string; reason: string; journal?: Journal },
) {
  for (const r of openReviews(snap, ticketId))
    await transition(adapter, snap.map.id, r.id, {
      event: 'cancel',
      actor: by.actor,
      actorKind: 'engine',
      reason: by.reason,
      journal: by.journal,
    });
}
