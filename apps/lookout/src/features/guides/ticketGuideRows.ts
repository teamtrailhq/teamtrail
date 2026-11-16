import { ticketGuideIds, trailGuidesByType, type MapDoc, type Ticket } from '@teamtrail/core';

/** One guide as the inspector shows it on a ticket: from its type or added to it, or its type's but taken off. */
export interface TicketGuideRow {
  id: string;
  via: 'type' | 'ticket';
  removed: boolean;
}

/** The ticket's guides in order (its type's, then the ones added), then its type's guides taken off it. */
export function ticketGuideRows(map: MapDoc, t: Ticket): TicketGuideRow[] {
  const on = ticketGuideIds(map, t).map((r) => ({ ...r, removed: false }));
  const inherited = trailGuidesByType(map).byType[t.type] ?? [];
  const off = inherited.filter((id) => t.guidesRemoved?.includes(id));
  return [...on, ...off.map((id) => ({ id, via: 'type' as const, removed: true }))];
}
