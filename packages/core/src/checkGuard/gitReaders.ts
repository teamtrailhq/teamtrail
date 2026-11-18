import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { git } from '../evidence/git';
import { localRepoFiles } from '../verification/localRepoFiles';
import { repoPath } from '../verification/repoPath';
import type { ReadText } from './types';

/** Files the guard reads are scripts, configs and tests: larger ones are never read. */
const MAX_BYTES = 1024 * 1024;
const unread: ReadText = async () => undefined;

/**
 * A commit's files, read from git's objects (`cat-file`, which runs no filter the repo's config names): `null` for a
 * path the commit doesn't have, undefined when the commit isn't here or the file is too large.
 */
export async function commitReader(cwd: string, commit: string | null | undefined): Promise<ReadText> {
  if (!commit || !/^[0-9a-f]{7,64}$/i.test(commit)) return unread;
  const has = await git(cwd, ['cat-file', '-t', '--end-of-options', commit]);
  if (has.code !== 0 || has.stdout.toString().trim() !== 'commit') return unread;
  return async (rel) => {
    const clean = repoPath(rel);
    if (!clean) return undefined;
    const size = await git(cwd, ['cat-file', '-s', '--end-of-options', `${commit}:${clean}`]);
    if (size.code !== 0) return null;
    if (Number(size.stdout.toString().trim()) > MAX_BYTES) return undefined;
    const blob = await git(cwd, ['cat-file', 'blob', '--end-of-options', `${commit}:${clean}`]);
    return blob.code === 0 ? blob.stdout.toString('utf8') : undefined;
  };
}

/**
 * A worktree's files as they are now: `null` when the path doesn't exist, undefined when it can't be read here (too
 * large, a link out of the repo).
 */
export function worktreeReader(toplevel: string): ReadText {
  const files = localRepoFiles(toplevel);
  if (!files) return unread;
  return async (rel) => {
    const text = await files.read(rel);
    if (text !== undefined) return text;
    const clean = repoPath(rel);
    if (!clean) return undefined;
    const there = await lstat(path.join(toplevel, clean)).catch(() => undefined);
    return there ? undefined : null;
  };
}
