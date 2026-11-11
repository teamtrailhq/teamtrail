import { existsSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { machineStore } from '../machine/machineStore';
import type { GuideLock, GuideLockEntry } from '../model/guide';

/*
 * The lock as the trail lead last approved it, on this machine:
 *   <config dir>/projects/<project id>/guides-approved.json   outside the repo (machine/machineStore.ts)
 * Written only by the trail lead's actions (writeGuideLock). An entry of guides.lock.json that differs from it was
 * changed outside Teamtrail (an agent editing the file, or a teammate's change pulled with git), so its guide is
 * disabled until the trail lead approves it again.
 *
 * Earlier versions kept the record in the repo's folder (`<tracker dir>/.agents/guides-approved.json`), where the same
 * agent or push could write it. That file is never read as an approval: its guides wait to be approved again.
 */
const FILE = 'guides-approved.json';
const legacyFile = (root: string) => path.join(root, AGENTS_DIR, FILE);

export function readApprovedLock(root: string): GuideLock {
  const raw = machineStore(root).read<GuideLock>(FILE);
  return { v: 1, guides: raw?.v === 1 && raw.guides ? raw.guides : {} };
}

export function writeApprovedLock(root: string, lock: GuideLock) {
  machineStore(root).write(FILE, lock);
}

/** Whether approvals from before they moved out of the repo are lying around: those guides are asked for again. */
export const hasLegacyApprovals = (root: string) => existsSync(legacyFile(root));

const same = (a?: GuideLockEntry, b?: GuideLockEntry) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether a guide's lock entry differs from what the trail lead approved here. */
export const lockChangedFor = (lock: GuideLock, approved: GuideLock, id: string) =>
  !same(lock.guides[id], approved.guides[id]);
