import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { ROLES_LOCK_FILE, type RoleLock, type RoleLockEntry } from '../model/role';
import { readApprovedLock, writeApprovedLock } from './approvedLock';

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

/**
 * Writes the lock with roles in id order, so diffs stay small. Only the trail lead's actions call this, for the role
 * `approvedId` they act on: that entry is recorded as approved on this machine (approvedLock.ts). Other entries keep
 * whatever approval they had, so approving one role never vouches for another's changed entry.
 */
export function writeRoleLock(root: string, lock: RoleLock, approvedId: string) {
  const roles = Object.fromEntries(Object.entries(lock.roles).sort(([a], [b]) => a.localeCompare(b)));
  writeJsonAtomic(roleLockPath(root), { v: 1, roles });
  const approved = readApprovedLock(root);
  const entry = readRoleLock(root).roles[approvedId];
  if (entry) approved.roles[approvedId] = entry;
  else delete approved.roles[approvedId];
  writeApprovedLock(root, approved);
}
