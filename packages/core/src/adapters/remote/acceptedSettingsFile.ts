import { closeSync, existsSync, mkdirSync, openSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../../agents/agentLink';
import { readJsonFile, writeJsonAtomic } from '../../lib/jsonFile';
import type { AcceptedEntry } from './settingsInForce';
import type { AcceptedStore } from './settingsLedger';

/*
 * The settings this machine accepted for each issue of a remote tracker:
 *   <tracker dir>/.agents/tracker-settings/<kind>-<target>.json   `{ v: 1, target, issues: { <issue id>: AcceptedEntry } }`
 * Local and never committed. Read on every use: the Lookout and each MCP server share it, and writes go through a
 * lock file so two processes never lose each other's entries. A file that is missing, unreadable or made for
 * another target holds nothing: every setting someone else wrote then waits for the human, it is never taken as
 * it stands. (Moving this into the per-machine store is a change to this file only.)
 */
export const ACCEPTED_DIR = `${AGENTS_DIR}/tracker-settings`;

const LOCK_STALE_MS = 5_000;
const LOCK_TRIES = 200;

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

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Runs `fn` holding `<file>.lock`; a lock left by a process that died is taken over after a few seconds. */
function locked(file: string, fn: () => void) {
  const lock = `${file}.lock`;
  for (let i = 0; i < LOCK_TRIES; i++) {
    try {
      closeSync(openSync(lock, 'wx'));
    } catch {
      const age = Date.now() - (statSync(lock, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (age > LOCK_STALE_MS) rmSync(lock, { force: true });
      else pause(10);
      continue;
    }
    try {
      return fn();
    } finally {
      rmSync(lock, { force: true });
    }
  }
  throw new Error(`could not lock ${file}`);
}

export function acceptedSettingsFile(root: string, target: string): AcceptedStore {
  const file = path.join(root, ACCEPTED_DIR, `${target}.json`);
  return {
    read: () => readDoc(file, target),
    put(entries) {
      const ignore = path.join(root, AGENTS_DIR, '.gitignore');
      mkdirSync(path.dirname(file), { recursive: true });
      if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
      locked(file, () => {
        const issues = readDoc(file, target);
        for (const [id, e] of Object.entries(entries)) {
          if (e) issues[id] = e;
          else delete issues[id];
        }
        writeJsonAtomic(file, { v: 1, target, issues } satisfies Doc);
      });
    },
  };
}
