import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { GUIDES_DIR, type InstalledGuide } from '../model/guide';
import { lockChangedFor, readApprovedLock } from './approvedLock';
import { BUILTIN_GUIDES } from './builtin/builtinGuides';
import { readGuideLock } from './guideLock';
import { missingGuide, guideStatus } from './guideStatus';

export const guidesDir = (root: string) => path.join(root, GUIDES_DIR);
export const guideFilePath = (root: string, id: string) => path.join(guidesDir(root), `${id}.md`);

/** The `.md` files in the guides folder, by id (the file name). */
export function readGuideFiles(root: string): { id: string; text: string }[] {
  const dir = guidesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((n) => ({ id: n.slice(0, -3), text: readFileSync(path.join(dir, n), 'utf8') }));
}

/**
 * Every guide the project has: the built-in ones, and the files in `guides/`, each checked against `guides.lock.json`.
 * A file with a built-in's id replaces it. Pinned guides whose file is gone stay listed as tampered. Id order.
 */
export function listGuides(root: string): InstalledGuide[] {
  const lock = readGuideLock(root);
  const approved = readApprovedLock(root);
  const files = readGuideFiles(root);
  const local = new Set(files.map((f) => f.id));
  const builtins = Object.entries(BUILTIN_GUIDES)
    .filter(([id]) => !local.has(id))
    .map(([id, text]) => guideStatus({ id, origin: 'builtin', text }));
  const installed = files.map((f) => {
    const lockChanged = lockChangedFor(lock, approved, f.id);
    // a changed entry can't be trusted: the approved one's required checks keep applying
    const entry = lockChanged ? approved.guides[f.id] : lock.guides[f.id];
    return guideStatus({ ...f, origin: 'local', lock: entry, lockChanged, overridesBuiltin: f.id in BUILTIN_GUIDES });
  });
  const gone = Object.entries({ ...approved.guides, ...lock.guides })
    .filter(([id]) => !local.has(id) && !(id in BUILTIN_GUIDES))
    .map(([id]) => missingGuide(id, approved.guides[id] ?? lock.guides[id]));
  return [...builtins, ...installed, ...gone].sort((a, b) => a.id.localeCompare(b.id));
}

/** Ids of the guides agents can use now. */
export const activeGuideIds = (guides: InstalledGuide[]) =>
  guides.filter((r) => r.status === 'active').map((r) => r.id);
