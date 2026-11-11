import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir } from '../../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../../lib/jsonFile';
import type { RerouteProposal } from '../../model/reroute';

/*
 * Reroute proposals, local history (gitignored):
 *   <tracker dir>/.reroutes/<mapId>/R-<n>.json
 * Ids are taken with an exclusive create, so two agents proposing at once never share one.
 */
export const REROUTES_DIR = '.reroutes';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const mapDir = (root: string, mapId: string) => path.join(root, REROUTES_DIR, safe(mapId));
const fileOf = (root: string, mapId: string, id: string) => path.join(mapDir(root, mapId), `${safe(id)}.json`);
const idNumber = (id: string) => Number(id.match(/^R-(\d+)$/)?.[1] ?? 0);

/** A trail's proposals, oldest first. */
export function listReroutes(root: string, mapId: string): RerouteProposal[] {
  let names: string[] = [];
  try {
    names = readdirSync(mapDir(root, mapId)).filter((n) => /^R-\d+\.json$/.test(n));
  } catch {
    return [];
  }
  return names
    .map((n) => readJsonFile<RerouteProposal>(path.join(mapDir(root, mapId), n)))
    .filter((p): p is RerouteProposal => !!p && p.v === 1)
    .sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

/** Every trail's proposals. */
export function listAllReroutes(root: string): RerouteProposal[] {
  let maps: string[] = [];
  try {
    maps = readdirSync(path.join(root, REROUTES_DIR)).filter((n) => !n.startsWith('.'));
  } catch {
    return [];
  }
  return maps.flatMap((m) => listReroutes(root, m));
}

export const readReroute = (root: string, mapId: string, id: string) =>
  readJsonFile<RerouteProposal>(fileOf(root, mapId, id));

/** Stores a new proposal under the next free id and returns it with that id. */
export function createReroute(root: string, draft: Omit<RerouteProposal, 'id'>): RerouteProposal {
  const dir = mapDir(root, draft.mapId);
  ensureLocalDir(path.join(root, REROUTES_DIR));
  mkdirSync(dir, { recursive: true });
  let n = Math.max(0, ...listReroutes(root, draft.mapId).map((p) => idNumber(p.id))) + 1;
  for (;;) {
    const p: RerouteProposal = { ...draft, id: `R-${n}` };
    try {
      writeFileSync(fileOf(root, draft.mapId, p.id), JSON.stringify(p, null, 2), { flag: 'wx' });
      return p;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      n++;
    }
  }
}

export function writeReroute(root: string, p: RerouteProposal) {
  ensureLocalDir(path.join(root, REROUTES_DIR));
  writeJsonAtomic(fileOf(root, p.mapId, p.id), p);
}
