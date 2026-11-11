import { mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { segment } from '../adapters/markdown/paths';
import { machineAccess } from '../machine/machineAccess';
import { machineId } from '../machine/machineId';
import { machineSign, machineSigned } from '../machine/machineKey';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { Fields } from './stateFields';

/*
 * The signed state of a trail, kept on this machine where nothing in the repo can write it:
 *   <config dir>/projects/<project id>/signed-state/<trail id>.json
 *     { v: 1, mapId, entries: { <item key>: StateEntry }, sig }
 * `sig` is the machine key's HMAC of the entries, bound to the project and the trail. Teamtrail writes it whenever
 * it writes a trail's map, a ticket or a decision (signedFs.ts), and when the human accepts an outside change. A
 * record that is missing, unreadable or not signed by this machine holds nothing: every gate field falls back to
 * what an unsigned item may claim (effectiveItem.ts). Never to "everything trusted".
 */
export const STATE_DIR = 'signed-state';
const VERSION = 1;

export interface StateEntry {
  /** The gate fields as Teamtrail last wrote them (stateFields.ts). */
  f: Fields;
  /** `fieldsHash(f)`. */
  h: string;
  /** `sha256:` of the whole file as Teamtrail last wrote it: a text edit since then is shown, never held. */
  file?: string;
  /** Who made the change: `lookout`, `agent <name>`, `accepted by trail lead`, … */
  by: string;
  at: number;
  /** A ticket's title, to show and restore one whose file was removed outside Teamtrail. */
  title?: string;
  /** A decision's file as Teamtrail wrote it: its words, for showing and restoring them. */
  text?: string;
}

export type StateEntries = Record<string, StateEntry>;

export interface StateRecord {
  entries: StateEntries;
  /** Why the record can't be used; set means nothing in it counts. */
  problem?: string;
  /** The config folder itself can't be used: nothing can be signed either. */
  blocked?: boolean;
}

const fileName = (mapId: string) => `${STATE_DIR}/${segment(mapId)}.json`;

export const stateRecordFile = (root: string, mapId: string) => machineStore(root).file(fileName(mapId));

const signed = (root: string, mapId: string, entries: StateEntries) => [
  'signed-state',
  machineId(root),
  mapId,
  JSON.stringify(entries),
];

/** Read and checked once per version of the file (its inode changes on every write, which renames). */
const cache = new Map<string, { stamp: string; record: StateRecord }>();

function stampOf(file: string): string | undefined {
  const s = statSync(file, { throwIfNoEntry: false });
  return s ? `${s.ino}:${s.mtimeMs}:${s.size}` : undefined;
}

function unreadable(mapId: string, why: string): StateRecord {
  return {
    entries: {},
    problem: `The signed record of trail ${mapId} can't be read (${why}), so nothing in it counts: everything on that trail is treated as changed outside Teamtrail until you accept or revert it.`,
  };
}

function parseRecord(root: string, mapId: string, text: string): StateRecord {
  let raw: { v?: unknown; mapId?: unknown; entries?: unknown; sig?: unknown };
  try {
    raw = JSON.parse(text) as typeof raw;
  } catch {
    return unreadable(mapId, 'not valid JSON');
  }
  if (raw.v !== VERSION || raw.mapId !== mapId || !raw.entries || typeof raw.entries !== 'object')
    return unreadable(mapId, 'not a record this version wrote');
  const entries = raw.entries as StateEntries;
  try {
    if (!machineSigned(signed(root, mapId, entries), raw.sig)) return unreadable(mapId, 'not signed on this machine');
  } catch {
    return { entries: {}, problem: machineAccess() ?? unreadable(mapId, 'no machine key').problem, blocked: true };
  }
  return { entries };
}

/** The trail's record as this machine signed it; empty (with `problem`) when it can't be trusted. */
export function readStateRecord(root: string, mapId: string): StateRecord {
  const file = stateRecordFile(root, mapId);
  const stamp = stampOf(file);
  if (!stamp) return { entries: {} };
  const hit = cache.get(file);
  if (hit?.stamp === stamp) return hit.record;
  let record: StateRecord;
  try {
    record = parseRecord(root, mapId, readFileSync(file, 'utf8'));
  } catch {
    record = { entries: {}, problem: machineAccess() ?? unreadable(mapId, 'no access').problem, blocked: true };
  }
  if (!record.blocked) cache.set(file, { stamp, record });
  return record;
}

/** Writes the trail's record, signed. Call it inside `withStateLock`. */
export function writeStateRecord(root: string, mapId: string, entries: StateEntries) {
  const sig = machineSign(signed(root, mapId, entries));
  machineStore(root).write(fileName(mapId), { v: VERSION, mapId, entries, sig });
}

/**
 * Runs `fn` holding the trail's lock: the Lookout and every MCP process write the same record, and a write of the
 * tracker file and its record happen together or not at all. Throws, saying why, when the config folder can't be
 * used: a change Teamtrail can't sign is not made.
 */
export function withStateLock<T>(root: string, mapId: string, fn: () => T): T {
  const blocked = machineAccess();
  if (blocked) throw new Error(blocked);
  const store = machineStore(root);
  mkdirSync(store.file(STATE_DIR), { recursive: true, mode: 0o700 });
  return withFileLock(`${stateRecordFile(root, mapId)}.lock`, fn);
}

/**
 * The record's entries to build on inside the lock. One that can't be read is kept aside (never overwritten, so
 * nothing is lost to look at) and the trail starts again from nothing signed: what fails closed stays closed.
 */
export function entriesToChange(root: string, mapId: string): StateEntries {
  const record = readStateRecord(root, mapId);
  if (record.blocked) throw new Error(record.problem);
  if (!record.problem) return { ...record.entries };
  const file = stateRecordFile(root, mapId);
  renameSync(file, `${file}.unreadable-${Date.now()}`);
  return {};
}

/** Read, change and write the trail's record under its lock. */
export function changeStateRecord(root: string, mapId: string, fn: (entries: StateEntries) => StateEntries) {
  withStateLock(root, mapId, () => writeStateRecord(root, mapId, fn(entriesToChange(root, mapId))));
}
