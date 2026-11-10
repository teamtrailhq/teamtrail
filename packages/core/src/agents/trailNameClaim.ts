import fs from 'node:fs';
import path from 'node:path';
import { processAlive } from '../lib/processAlive';
import { AGENTS_DIR } from './agentLink';

export const TRAIL_NAMES_DIR = 'trailNames';

const name = (family: string, n: number) => `${family}-${String(n).padStart(2, '0')}`;

/**
 * Reserves the first free `<family>-NN` trail name for this process, atomically across processes: each trail name is
 * a lock file created with O_EXCL, so two agents connecting in the same instant can never get the same one. A lock
 * whose process is gone is taken over. `taken` adds names in use elsewhere (e.g. running session docs). The lock is
 * removed when this process exits.
 *
 * `holder` is for a process that hosts several agents (MCP over HTTP): each agent passes its own id, a name held
 * by another holder of the same process counts as taken, and the agent gives the name back itself
 * (`releaseTrailName`) when its session ends.
 */
export function claimTrailName(root: string, family: string, taken: Set<string> = new Set(), holder?: string): string {
  const dir = path.join(root, AGENTS_DIR, TRAIL_NAMES_DIR);
  fs.mkdirSync(dir, { recursive: true });
  for (let n = 1; ; n++) {
    const trailName = name(family, n);
    if (taken.has(trailName)) continue;
    const file = path.join(dir, `${trailName}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, holder, at: Date.now() }), { flag: 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const lock = readLock(file);
      // half-written by its owner a moment ago: treat as held
      if (!lock) continue;
      const owner = lock.pid ?? 0;
      if (owner === process.pid && lock.holder === holder) return trailName;
      if (processAlive(owner)) continue;
      // Stale: its process is gone. Remove and retry this number; another agent may win the retry, which is fine.
      fs.rmSync(file, { force: true });
      n--;
      continue;
    }
    if (holder === undefined) process.once('exit', () => fs.rmSync(file, { force: true }));
    return trailName;
  }
}

function readLock(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as { pid?: number; holder?: string };
  } catch {
    return undefined;
  }
}

/** Gives a trail name back when the agent that held it in this process is done with it. */
export function releaseTrailName(root: string, trailName: string, holder: string) {
  const file = path.join(root, AGENTS_DIR, TRAIL_NAMES_DIR, `${trailName}.json`);
  const lock = readLock(file);
  if (lock?.pid === process.pid && lock.holder === holder) fs.rmSync(file, { force: true });
}
