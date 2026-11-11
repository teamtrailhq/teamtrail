import { rmSync } from 'node:fs';
import path from 'node:path';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import { announcementSig } from '../machine/announcementSig';
import { agentPaths, type LookoutLock } from './agentLink';

/** What a Lookout's lock signature is for (projects/elsewhereUrl.ts checks it). */
export const LOCK_SIG = 'lookout-lock';

/** Claims the tracker for this process's Lookout, signed with the machine key; returns the release function. */
export function writeLookoutLock(root: string, url: string) {
  const startedAt = Date.now();
  const sig = announcementSig(root, LOCK_SIG, [url, process.pid, startedAt]);
  const lock: LookoutLock = { url, pid: process.pid, startedAt, ...(sig ? { sig } : {}) };
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
