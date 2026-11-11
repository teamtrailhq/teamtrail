import { readdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { stateItemFor } from './stateItem';
import { readStateRecord, STATE_DIR } from './stateRecord';

/** The trails this machine holds a signed record for. */
export function recordedTrails(root: string): string[] {
  try {
    const names = readdirSync(machineStore(root).file(STATE_DIR));
    return names.filter((n) => /^[^.].*\.json$/.test(n)).map((n) => n.slice(0, -'.json'.length));
  } catch {
    return [];
  }
}

/**
 * Tickets and decisions the record holds whose file is gone, on trails that are still there: removed outside
 * Teamtrail. They stay listed, so a removed blocker still blocks and a removed decision still stands until the
 * human accepts the removal. `files` is the folder's listing.
 */
export function removedFiles(root: string, files: string[]): string[] {
  const have = new Set(files);
  return recordedTrails(root)
    .filter((mapId) => have.has(`${mapId}/map.md`))
    .flatMap((mapId) =>
      Object.keys(readStateRecord(root, mapId).entries)
        .map((key) => stateItemFor(mapId, key)?.rel)
        .filter((rel): rel is string => !!rel && rel !== `${mapId}/map.md` && !have.has(rel)),
    );
}

/**
 * Trails this machine signed whose map is gone: removed, or renamed (moved to another folder, which is then a
 * trail nobody signed here). Each is one change, accepted or restored as a whole.
 */
export function removedTrails(root: string, files: string[]): string[] {
  const have = new Set(files);
  return recordedTrails(root).filter(
    (mapId) => !have.has(`${mapId}/map.md`) && Object.keys(readStateRecord(root, mapId).entries).length > 0,
  );
}
