import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { RoleLock, RoleLockEntry } from '../model/role';

/*
 * The lock as the trail lead last approved it, on this machine:
 *   <tracker dir>/.agents/roles-approved.json   local, never committed
 * Written only by the trail lead's actions (writeRoleLock). An entry of roles.lock.json that differs from it was
 * changed outside Teamtrail (an agent editing the file, or a teammate's change pulled with git), so its role is
 * disabled until the trail lead approves it again, like verification.json's `config-changed`.
 */
const fileOf = (root: string) => path.join(root, AGENTS_DIR, 'roles-approved.json');

export function readApprovedLock(root: string): RoleLock {
  const raw = readJsonFile<RoleLock>(fileOf(root));
  return { v: 1, roles: raw?.v === 1 && raw.roles ? raw.roles : {} };
}

export function writeApprovedLock(root: string, lock: RoleLock) {
  const ignore = path.join(root, AGENTS_DIR, '.gitignore');
  mkdirSync(path.dirname(ignore), { recursive: true });
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  writeJsonAtomic(fileOf(root), lock);
}

const same = (a?: RoleLockEntry, b?: RoleLockEntry) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether a role's lock entry differs from what the trail lead approved here. */
export const lockChangedFor = (lock: RoleLock, approved: RoleLock, id: string) =>
  !same(lock.roles[id], approved.roles[id]);
