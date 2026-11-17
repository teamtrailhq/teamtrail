import { existsSync, realpathSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RepoFiles } from '../model/checkScreening';
import { repoPath } from './repoPath';

/** Larger files are never read: nothing screening reads is this big. */
const MAX_SCREEN_BYTES = 1024 * 1024;

/** The real path of a repo-relative path, only when it stays inside the repo after every link is followed. */
async function inside(real: string, rel: string): Promise<string | undefined> {
  const clean = repoPath(rel);
  if (clean === undefined) return undefined;
  const target = await realpath(path.join(real, clean)).catch(() => undefined);
  if (!target) return undefined;
  return target === real || target.startsWith(real + path.sep) ? target : undefined;
}

/**
 * This machine's checkout as screening reads it (model/checkScreening.ts `RepoFiles`): repo-relative paths only, a
 * symbolic link that leads outside the repo reads as nothing, and files over 1 MB are never read. Undefined when the
 * folder isn't a git checkout, where the tracker folder's parent holds no code to screen (a hosted engine's).
 */
export function localRepoFiles(repoRoot: string): RepoFiles | undefined {
  let real: string;
  try {
    real = realpathSync(repoRoot);
  } catch {
    return undefined;
  }
  if (!existsSync(path.join(real, '.git'))) return undefined;
  return {
    async read(rel) {
      const file = await inside(real, rel);
      const s = file ? await stat(file).catch(() => undefined) : undefined;
      if (!file || !s?.isFile() || s.size > MAX_SCREEN_BYTES) return undefined;
      return readFile(file, 'utf8').catch(() => undefined);
    },
    async kind(rel) {
      const file = await inside(real, rel);
      const s = file ? await stat(file).catch(() => undefined) : undefined;
      if (s?.isDirectory()) return 'dir';
      return s?.isFile() ? 'file' : undefined;
    },
  };
}
