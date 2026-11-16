import type { MapDoc, Ticket } from '../model/types';
import { trailGuidesByType } from './trailGuidesByType';

/** One guide a ticket takes on: inherited from its type on the trail, or added to the ticket itself. */
export interface TicketGuideRef {
  id: string;
  via: 'type' | 'ticket';
}

/** The guides added to `t` itself: `guidesAdded`, and the single `guide` of older tickets, which counts as one. */
export const addedGuides = (t: Pick<Ticket, 'guide' | 'guidesAdded'>) => [
  ...new Set([...(t.guide ? [t.guide] : []), ...(t.guidesAdded ?? [])]),
];

/**
 * The guides `t` takes on: its type's on the trail, then the ones added to it, without the ones removed from it.
 * Each id once, in that order.
 */
export function ticketGuideIds(
  map: Pick<MapDoc, 'guides' | 'guidesByType'>,
  t: Pick<Ticket, 'type' | 'guide' | 'guidesAdded' | 'guidesRemoved'>,
): TicketGuideRef[] {
  const removed = new Set(t.guidesRemoved ?? []);
  const inherited = trailGuidesByType(map).byType[t.type] ?? [];
  const refs: TicketGuideRef[] = inherited.map((id) => ({ id, via: 'type' }));
  for (const id of addedGuides(t)) if (!inherited.includes(id)) refs.push({ id, via: 'ticket' });
  return refs.filter((r) => !removed.has(r.id));
}
