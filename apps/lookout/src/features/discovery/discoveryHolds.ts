import { DISCOVERY_TYPES, type Ticket } from '@teamtrail/core';

/**
 * Whether the discovery gate holds a ticket: it's open and not discovery work (research, junction, review), on a
 * trail that still needs an accepted brief here (`gated`, from `GET /briefs`). The server refuses such claims.
 */
export function discoveryHolds(gated: boolean, t: Pick<Ticket, 'state' | 'type'>): boolean {
  return gated && t.state === 'open' && !DISCOVERY_TYPES.includes(t.type);
}
