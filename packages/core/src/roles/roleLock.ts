import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { ROLES_LOCK_FILE, type RoleLock, type RoleLockEntry } from '../model/role';

export const roleLockPath = (root: string) => path.join(root, ROLES_LOCK_FILE);

const isEntry = (e: unknown): e is RoleLockEntry =>
  !!e && typeof e === 'object' && typeof (e as RoleLockEntry).sha256 === 'string';

/** `roles.lock.json`; missing or unreadable means nothing is pinned, so every local role waits for approval. */
export function readRoleLock(root: string): RoleLock {
  const raw = readJsonFile<RoleLock>(roleLockPath(root));
  const roles: Record<string, RoleLockEntry> = {};
  for (const [id, e] of Object.entries(raw?.v === 1 && raw.roles ? raw.roles : {}))
    if (isEntry(e))
      roles[id] = { ...e, approvedChecks: e.approvedChecks ?? {}, requiresChecks: e.requiresChecks ?? [] };
  return { v: 1, roles };
}

/** Writes the lock with roles in id order, so diffs stay small. */
export function writeRoleLock(root: string, lock: RoleLock) {
  const roles = Object.fromEntries(Object.entries(lock.roles).sort(([a], [b]) => a.localeCompare(b)));
  writeJsonAtomic(roleLockPath(root), { v: 1, roles });
}
