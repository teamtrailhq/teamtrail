import type { TrailRun } from '../model/trailChecks';

/**
 * The attention item a failed combined run raises for a trail: its id (as `buildAttention` makes it), its title
 * ("Trail checks fail on main after merging PR #3, PR #5, PR #7") and the query that opens it in the Lookout.
 */
export function trailChecksItem(run: Pick<TrailRun, 'mapId' | 'id' | 'merges'>) {
  const merged = run.merges
    .filter((m) => m.state === 'merged')
    .map((m) => (m.pr !== undefined ? `PR #${m.pr}` : m.key));
  const title = merged.length
    ? `Trail checks fail on main after merging ${merged.join(', ')}`
    : 'Trail checks fail on main';
  const id = `trail-checks:${run.mapId}:${run.id}`;
  return { id, title, link: `?item=${encodeURIComponent(id)}` };
}
