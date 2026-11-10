import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { AGENTS_DIR } from '../../agents/agentLink';
import { sleep } from '../../lib/emitter';
import { readJsonFile, writeJsonAtomic } from '../../lib/jsonFile';
import type { AcceptedEntry } from './settingsInForce';
import type { AcceptedStore } from './settingsLedger';

/*
 * The settings this machine accepted for each issue of a remote tracker:
 *   <tracker dir>/.agents/tracker-settings/<kind>-<target>.json   `{ v: 1, target, issues: { <issue id>: AcceptedEntry } }`
 * Local and never committed. Read on every use: the Lookout and each MCP server share it, and changes go through
 * a lock file so two processes never lose each other's entries. A file that is missing, unreadable or made for
 * another target holds nothing accepted; so does a change that can't get the lock (it is skipped). Either way
 * settings someone else wrote are then only "unconfirmed" (settingsInForce.ts), never taken as they stand.
 * (Moving this into the per-machine store is a change to this file only.)
 */
export const ACCEPTED_DIR = `${AGENTS_DIR}/tracker-settings`;

const LOCK_STALE_MS = 5_000;
/** Waits between tries, about a second in all; the event loop keeps running meanwhile. */
const BACKOFF_MS = [0, 5, 10, 20, 40, 80, 160, 320, 400];

interface Doc {
  v: 1;
  target: string;
  issues: Record<string, AcceptedEntry>;
}

const isEntry = (e: unknown): e is AcceptedEntry => !!e && typeof e === 'object' && !Array.isArray(e);

function readDoc(file: string, target: string): Record<string, AcceptedEntry> {
  const raw = readJsonFile<Doc>(file);
  if (raw?.v !== 1 || raw.target !== target || !raw.issues || typeof raw.issues !== 'object') return {};
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
  const file = path.join(root, ACCEPTED_DIR, `${target}.json`);
  return {
    read: () => readDoc(file, target),
    async update(change) {
      const ignore = path.join(root, AGENTS_DIR, '.gitignore');
      mkdirSync(path.dirname(file), { recursive: true });
      if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
      const done = await withLock(file, () => {
        const issues = readDoc(file, target);
        for (const [id, e] of Object.entries(change(issues))) {
          if (e) issues[id] = e;
          else delete issues[id];
        }
        writeJsonAtomic(file, { v: 1, target, issues } satisfies Doc);
      });
      if (!done) console.warn(`teamtrail: ${path.basename(file)} is locked; settings not recorded this time`);
      return done;
    },
  };
}
