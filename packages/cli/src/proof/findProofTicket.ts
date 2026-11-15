import type { MapSnapshot, Ticket } from '@teamtrail/core';

const norm = (s: string) => s.trim().replace(/^#/, '').toLowerCase();

/**
 * The ticket `teamtrail proof` was asked for: by key (`#6`, `6`) or id, in the trail named by id, key or title, or
 * in whichever trail has it when none is named. Ambiguous or unknown refs say what to pass instead.
 */
export function findProofTicket(input: {
  snaps: MapSnapshot[];
  ticket: string;
  trail?: string;
}): { snap: MapSnapshot; ticket: Ticket } | { error: string } {
  const { snaps, trail } = input;
  if (!snaps.length) return { error: 'No trails in this tracker folder. Pass --dir if it is elsewhere.' };
  const inTrail = trail
    ? snaps.filter((s) => s.map.id === trail || norm(s.map.key) === norm(trail) || norm(s.map.title) === norm(trail))
    : snaps;
  if (!inTrail.length)
    return { error: `Unknown trail "${trail}". Trails: ${snaps.map((s) => s.map.title).join('; ')}` };
  const want = norm(input.ticket);
  const hits = inTrail.flatMap((snap) =>
    snap.tickets.filter((t) => t.id.toLowerCase() === want || norm(t.key) === want).map((ticket) => ({ snap, ticket })),
  );
  if (hits.length === 1) return hits[0];
  if (!hits.length) return { error: `No ticket ${input.ticket}${trail ? ` in trail ${trail}` : ''}.` };
  return {
    error: `${input.ticket} is in more than one trail (${hits.map((h) => h.snap.map.title).join('; ')}): pass --trail.`,
  };
}
