import path from 'node:path';
import type { RepoReadiness } from '../model/readiness';
import type { MapSnapshot } from '../model/types';
import { localRepoFiles } from '../verification/localRepoFiles';
import { readinessHold } from './readinessHold';
import { readReadiness } from './readReadiness';

/**
 * Repo readiness for the attention queue: read from this machine's checkout of the tracker folder's repo, probed
 * here, with the tickets it holds on each active trail. Undefined when it can't be read (no checkout here).
 */
export async function readinessForTrails(
  root: string,
  snaps: MapSnapshot[],
): Promise<{ readiness: RepoReadiness; held: { mapId: string; tickets: string[] }[] } | undefined> {
  try {
    const readiness = await readReadiness({ root, files: localRepoFiles(path.dirname(root)), probe: true });
    if (!readiness.read) return undefined;
    const held = snaps.map((snap) => ({
      mapId: snap.map.id,
      tickets: readinessHold({ root, snap, readiness }).held.map((t) => t.id),
    }));
    return { readiness, held };
  } catch {
    return undefined;
  }
}
