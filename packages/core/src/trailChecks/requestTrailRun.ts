import type { MainRunEnv } from '../mainChecks/startMainRun';
import type { MapSnapshot } from '../model/types';
import { readTrailMerges } from './readTrailMerges';
import { startTrailRun, type TrailRunStart } from './startTrailRun';

/** The trail lead, as the journal names them for a run asked for in the Lookout. */
export const TRAIL_RUN_BY = 'trail lead';

/**
 * The trail lead's Run now (before everything is merged: on the default branch as it is) and Run again: a combined
 * run for the trail's done tickets now, journaled as theirs. A run before every ticket is done and merged is shown
 * as such and never verifies the trail together.
 */
export function requestTrailRun(env: MainRunEnv, snap: MapSnapshot, by = TRAIL_RUN_BY): TrailRunStart {
  const inScope = snap.tickets.filter((t) => !(t.state === 'closed' && t.closeReason === 'not_planned'));
  const allDone = inScope.length > 0 && inScope.every((t) => t.state === 'closed');
  const merges = readTrailMerges(env.root, snap);
  return startTrailRun(env, { mapId: snap.map.id, merges, allDone, by, actorKind: 'trail lead' });
}
