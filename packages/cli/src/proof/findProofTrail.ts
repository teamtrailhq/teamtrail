import type { MapSnapshot } from '@teamtrail/core';

const norm = (s: string) => s.trim().replace(/^#/, '').toLowerCase();

/** The trail `teamtrail proof --trail` was asked for, by id, key (`#3`, `3`) or title; unknown ones list the trails. */
export function findProofTrail(snaps: MapSnapshot[], trail: string): MapSnapshot | { error: string } {
  if (!snaps.length) return { error: 'No trails in this tracker folder. Pass --dir if it is elsewhere.' };
  const hits = snaps.filter(
    (s) => s.map.id === trail || norm(s.map.key) === norm(trail) || norm(s.map.title) === norm(trail),
  );
  if (hits.length === 1) return hits[0];
  if (!hits.length) return { error: `Unknown trail "${trail}". Trails: ${snaps.map((s) => s.map.title).join('; ')}` };
  return { error: `"${trail}" names more than one trail: pass its id (${hits.map((s) => s.map.id).join(', ')}).` };
}
