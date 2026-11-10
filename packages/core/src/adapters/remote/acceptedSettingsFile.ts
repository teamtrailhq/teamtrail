import { mkdirSync } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { sleep } from '../../lib/emitter';
import { readJsonFile } from '../../lib/jsonFile';
import { machineId } from '../../machine/machineId';
import { machineSign, machineSigned } from '../../machine/machineKey';
import { machineStore } from '../../machine/machineStore';
import { writePrivateFile } from '../../machine/writePrivateFile';
import type { AcceptedEntry } from './settingsInForce';
import type { AcceptedStore } from './settingsLedger';

/*
 * The settings this machine accepted for each issue of a remote tracker, in the per-machine store:
 *   <config dir>/projects/<project id>/tracker-settings/<kind>-<target>.json
 *     `{ v: 1, target, issues: { <issue id>: AcceptedEntry }, mac }`   0600, signed with the machine key
 * Outside the repo, so an agent that can write files there can't plant or edit acceptances, and signed, so a file
 * this machine's Teamtrail didn't write (or that was edited) holds nothing. Read on every use: the Lookout and each
 * MCP server share it, and changes go through a lock file so two processes never lose each other's entries. A file
 * that is missing, unreadable, unsigned, made for another target, or a key that can't be read holds nothing
 * accepted; so does a change that can't get the lock (it is skipped). Either way settings someone else wrote are then
 * only "unconfirmed" (settingsInForce.ts), never taken as they stand. Earlier versions kept it in the repo's
 * `.agents/tracker-settings/`; that folder is never read.
 */
export const ACCEPTED_DIR = 'tracker-settings';

/** Where one target's record lives on this machine. */
export const acceptedSettingsPath = (root: string, target: string) =>
  path.join(machineStore(root).dir, ACCEPTED_DIR, `${target}.json`);

const LOCK_STALE_MS = 5_000;
/** Waits between tries, about a second in all; the event loop keeps running meanwhile. */
const BACKOFF_MS = [0, 5, 10, 20, 40, 80, 160, 320, 400];

interface Doc {
  v: 1;
  target: string;
  issues: Record<string, AcceptedEntry>;
  /** This machine's signature of the target and the issues, for this project (machine/machineKey.ts). */
  mac: string;
}

const macParts = (root: string, target: string, issues: Record<string, AcceptedEntry>) => [
  'tracker-settings',
  machineId(root),
  target,
  JSON.stringify(issues),
];

/** Whether this machine's Teamtrail wrote `issues`; a key that can't be read counts as no. */
function signed(root: string, target: string, issues: Record<string, AcceptedEntry>, mac: unknown) {
  try {
    return machineSigned(macParts(root, target, issues), mac);
  } catch {
    return false;
  }
}

const isEntry = (e: unknown): e is AcceptedEntry => !!e && typeof e === 'object' && !Array.isArray(e);

function readDoc(root: string, file: string, target: string): Record<string, AcceptedEntry> {
  const raw = readJsonFile<Doc>(file);
  if (raw?.v !== 1 || raw.target !== target || !raw.issues || typeof raw.issues !== 'object') return {};
  if (!signed(root, target, raw.issues, raw.mac)) return {};
  return Object.fromEntries(Object.entries(raw.issues).filter(([, e]) => isEntry(e)));
}

/** Creates the lock file, or says it is taken. */
const tryLock = (lock: string) =>
  open(lock, 'wx').then(
    (h) => h.close().then(() => true),
    () => false,
  );

/**
 * A lock left by a process that died is moved aside with one atomic rename: of two processes that both find it
 * stale, only one rename succeeds, and the other goes back to waiting for the lock.
 */
async function clearStale(lock: string) {
  const s = await stat(lock).catch(() => undefined);
  if (!s || Date.now() - s.mtimeMs < LOCK_STALE_MS) return;
  const aside = `${lock}.stale-${process.pid}-${Date.now()}`;
  const moved = await rename(lock, aside).then(
    () => true,
    () => false,
  );
  if (moved) await rm(aside, { force: true });
}

/** Runs `fn` holding `<file>.lock`; false when the lock couldn't be had (nothing ran). */
async function withLock(file: string, fn: () => void): Promise<boolean> {
  const lock = `${file}.lock`;
  for (const wait of BACKOFF_MS) {
    if (wait) await sleep(wait);
    if (await tryLock(lock)) {
      try {
        fn();
        return true;
      } finally {
        await rm(lock, { force: true });
      }
    }
    await clearStale(lock);
  }
  return false;
}

export function acceptedSettingsFile(root: string, target: string): AcceptedStore {
  const file = acceptedSettingsPath(root, target);
  return {
    read: () => readDoc(root, file, target),
    async update(change) {
      try {
        mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      } catch {
        return false;
      }
      const done = await withLock(file, () => {
        const issues = readDoc(root, file, target);
        for (const [id, e] of Object.entries(change(issues))) {
          if (e) issues[id] = e;
          else delete issues[id];
        }
        const mac = machineSign(macParts(root, target, issues));
        writePrivateFile(file, `${JSON.stringify({ v: 1, target, issues, mac } satisfies Doc, null, 2)}\n`);
      });
      if (!done) console.warn(`teamtrail: ${path.basename(file)} is locked; settings not recorded this time`);
      return done;
    },
  };
}
