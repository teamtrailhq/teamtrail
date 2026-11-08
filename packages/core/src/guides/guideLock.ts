import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { GUIDES_LOCK_FILE, type GuideLock, type GuideLockEntry } from '../model/guide';
import { readApprovedLock, writeApprovedLock } from './approvedLock';

export const guideLockPath = (root: string) => path.join(root, GUIDES_LOCK_FILE);

const isEntry = (e: unknown): e is GuideLockEntry =>
  !!e && typeof e === 'object' && typeof (e as GuideLockEntry).sha256 === 'string';

/** `guides.lock.json`; missing or unreadable means nothing is pinned, so every local guide waits for approval. */
export function readGuideLock(root: string): GuideLock {
  const raw = readJsonFile<GuideLock>(guideLockPath(root));
  const guides: Record<string, GuideLockEntry> = {};
  for (const [id, e] of Object.entries(raw?.v === 1 && raw.guides ? raw.guides : {}))
    if (isEntry(e))
      guides[id] = { ...e, approvedChecks: e.approvedChecks ?? {}, requiresChecks: e.requiresChecks ?? [] };
  return { v: 1, guides };
}

/**
 * Writes the lock with guides in id order, so diffs stay small. Only the trail lead's actions call this, for the guide
 * `approvedId` they act on: that entry is recorded as approved on this machine (approvedLock.ts). Other entries keep
 * whatever approval they had, so approving one guide never vouches for another's changed entry.
 */
export function writeGuideLock(root: string, lock: GuideLock, approvedId: string) {
  const guides = Object.fromEntries(Object.entries(lock.guides).sort(([a], [b]) => a.localeCompare(b)));
  writeJsonAtomic(guideLockPath(root), { v: 1, guides });
  const approved = readApprovedLock(root);
  const entry = readGuideLock(root).guides[approvedId];
  if (entry) approved.guides[approvedId] = entry;
  else delete approved.guides[approvedId];
  writeApprovedLock(root, approved);
}
