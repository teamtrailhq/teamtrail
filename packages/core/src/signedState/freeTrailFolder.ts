import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { stateRecordFile } from './stateRecord';
import { refuseLinks } from './trackerFileWrite';
import { holdsTrailState } from './trailLocalState';

/** Whether a file stands anywhere under `dir` (a link counts as one); false when there is no such folder. */
function holdsFiles(dir: string): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
  return entries.some((e) => !e.isDirectory() || holdsFiles(path.join(dir, e.name)));
}

/**
 * Whether a new trail may take the folder `mapId`: nothing is in it (no map, ticket, decision or any other file of
 * a trail, archived or not), this machine holds no record for a trail of that name (one removed outside
 * Teamtrail, still waiting for the human), and no local-only state is kept under it (trailLocalState.ts: a trail
 * folder deleted by hand before anything was signed leaves its journal and evidence, which a new trail would inherit). Call it under the trail's lock, which every Teamtrail process takes to
 * write the trail, so of several creating a trail under one name exactly one gets it.
 */
export function freeTrailFolder(root: string, mapId: string): boolean {
  if (existsSync(stateRecordFile(root, mapId))) return false;
  if (holdsTrailState(root, mapId)) return false;
  refuseLinks(root, mapId);
  return !holdsFiles(path.join(root, mapId));
}
