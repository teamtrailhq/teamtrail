import { rmSync } from 'node:fs';
import path from 'node:path';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import { agentPaths, type LookoutLock } from './agentLink';

/** Claims the tracker for this process's Lookout; returns the release function. */
export function writeLookoutLock(root: string, url: string) {
  const lock: LookoutLock = { url, pid: process.pid, startedAt: Date.now() };
  writeLocalJson(root, agentPaths.lock, lock);
  return () => {
    const cur = readJsonFile<LookoutLock>(path.join(root, agentPaths.lock));
    if (cur?.pid === process.pid) rmSync(path.join(root, agentPaths.lock), { force: true });
  };
}

/** The running Lookout for this tracker, if any. */
export function readLookoutLock(root: string): LookoutLock | undefined {
  const lock = readJsonFile<LookoutLock>(path.join(root, agentPaths.lock));
  return lock && processAlive(lock.pid) ? lock : undefined;
}
