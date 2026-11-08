import { chartMap, DISCOVERY_TICKET, type Assumption, type TrackerAdapter } from '@teamtrail/core';
import { apiBase } from './apiBase';

/**
 * A trail started from the Lookout: the map with its destination, notes and assumptions, plus the
 * discovery ticket and an empty brief. Any agent picks it up with `/scout resume`; Teamtrail still never starts one
 * locally.
 */
export async function createTrail(
  adapter: TrackerAdapter,
  input: { title: string; destination: string; notes: string; assumptions?: string[] },
) {
  const assumptions = (input.assumptions ?? []).map((text, i): Assumption => ({
    id: `S-${i + 1}`,
    text,
    status: 'holding',
    tickets: [],
  }));
  const { map, tickets } = await chartMap(adapter, {
    title: input.title,
    sections: {
      destination: input.destination,
      notes: input.notes,
      decisions: [],
      unspecified: [],
      outOfScope: [],
      ...(assumptions.length ? { assumptions } : {}),
    },
    tickets: [{ ref: 'discovery', ...DISCOVERY_TICKET }],
  });
  await fetch(`${apiBase()}/briefs/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: map.id, ticketId: tickets[0]?.id }),
  });
  return map;
}
