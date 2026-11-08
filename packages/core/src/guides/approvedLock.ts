import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { GuideLock, GuideLockEntry } from '../model/guide';

/*
 * The lock as the trail lead last approved it, on this machine:
 *   <tracker dir>/.agents/guides-approved.json   local, never committed
 * Written only by the trail lead's actions (writeGuideLock). An entry of guides.lock.json that differs from it was
 * changed outside Teamtrail (an agent editing the file, or a teammate's change pulled with git), so its guide is
 * disabled until the trail lead approves it again, like verification.json's `config-changed`.
 */
const fileOf = (root: string) => path.join(root, AGENTS_DIR, 'guides-approved.json');

export function readApprovedLock(root: string): GuideLock {
  const raw = readJsonFile<GuideLock>(fileOf(root));
  return { v: 1, guides: raw?.v === 1 && raw.guides ? raw.guides : {} };
}

export function writeApprovedLock(root: string, lock: GuideLock) {
  const ignore = path.join(root, AGENTS_DIR, '.gitignore');
  mkdirSync(path.dirname(ignore), { recursive: true });
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  writeJsonAtomic(fileOf(root), lock);
}

const same = (a?: GuideLockEntry, b?: GuideLockEntry) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether a guide's lock entry differs from what the trail lead approved here. */
export const lockChangedFor = (lock: GuideLock, approved: GuideLock, id: string) =>
  !same(lock.guides[id], approved.guides[id]);
