import path from 'node:path';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import type { TrailRun } from '../model/trailChecks';
import { evidencePaths } from '../verification/evidenceStore';

/*
 * Runs of the approved checks on the default branch for one trail, local to this machine, next to its tickets'
 * evidence (no ticket is called `_trail`):
 *   <tracker dir>/.evidence/<mapId>/_trail/latest.json          { id }: the run the trail reads
 *   <tracker dir>/.evidence/<mapId>/_trail/runs/<id>.json       TrailRun
 *   <tracker dir>/.evidence/<mapId>/_trail/runs/<id>/<check>.log
 * One run at a time per project, with runs on main: they share `.evidence/_main/running.json` (mainRunStore.ts).
 */
const TRAIL_DIR = '_trail';
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
/** Past this, a run whose process is still alive is taken for stuck all the same. */
const STUCK_MARGIN_MS = 5 * 60_000;

const dir = (mapId: string) => evidencePaths.ticket(mapId, TRAIL_DIR);

export const trailPaths = {
  run: (mapId: string, id: string) => `${dir(mapId)}/runs/${safe(id)}.json`,
  logs: (mapId: string, id: string) => `${dir(mapId)}/runs/${safe(id)}`,
  latest: (mapId: string) => `${dir(mapId)}/latest.json`,
};

export function readTrailRun(root: string, mapId: string, id: string): TrailRun | undefined {
  const r = readJsonFile<TrailRun>(path.join(root, trailPaths.run(mapId, id)));
  return r?.v === 1 && r.mapId === mapId ? r : undefined;
}

export function writeTrailRun(root: string, run: TrailRun) {
  writeLocalJson(root, trailPaths.run(run.mapId, run.id), run);
  writeLocalJson(root, trailPaths.latest(run.mapId), { id: run.id });
}

/** The trail's latest run, with one whose process is gone (or stuck past `budgetMs`) read as unavailable. */
export function latestTrailRun(root: string, mapId: string, budgetMs = 0): TrailRun | undefined {
  const id = readJsonFile<{ id?: string }>(path.join(root, trailPaths.latest(mapId)))?.id;
  const run = typeof id === 'string' ? readTrailRun(root, mapId, id) : undefined;
  if (!run || run.result !== 'running') return run;
  const alive = !!run.pid && processAlive(run.pid);
  const stuck = Date.now() - run.startedAt > budgetMs + STUCK_MARGIN_MS;
  if (alive && !stuck) return run;
  const { pid: _pid, ...rest } = run;
  return { ...rest, result: 'unavailable', note: 'The run stopped before it finished.' };
}
