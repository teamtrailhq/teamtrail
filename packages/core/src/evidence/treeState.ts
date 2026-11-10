import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { GitTreeState } from '../model/evidence';
import { git, gitText, zList } from './git';

/** A worktree: its root and the pathspec that leaves the tracker folder out. */
export interface Worktree {
  toplevel: string;
  pathspec: string[];
}

const posix = (p: string) => p.split(path.sep).join('/');

/** The git worktree holding `cwd`, or why there is none. */
export async function findWorktree(cwd: string, trackerRoot?: string): Promise<Worktree | { error: string }> {
  if (!existsSync(cwd)) return { error: `${cwd} does not exist` };
  const r = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (r.code === null) return { error: `git is not available (${r.stderr.trim()})` };
  if (r.code !== 0) return { error: `${cwd} is not inside a git repository` };
  const toplevel = realpathSync(r.stdout.toString('utf8').trim());
  const pathspec = ['--', '.'];
  if (trackerRoot && existsSync(trackerRoot)) {
    const rel = path.relative(toplevel, realpathSync(trackerRoot));
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) pathspec.push(`:(exclude)${posix(rel)}`);
  }
  return { toplevel, pathspec };
}

/** The empty tree's id in this repo's hash format: what a repo without commits is compared against. */
export const emptyTree = (wt: Worktree) =>
  gitText(wt.toplevel, ['hash-object', '-t', 'tree', '--stdin'], '').then((s) => s ?? '');

/** Content hashes of `files` as git would store them; `null` for files that are gone. */
export async function hashFiles(wt: Worktree, files: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const present = files.filter((f) => existsSync(path.join(wt.toplevel, f)));
  for (const f of files) out[f] = null;
  if (!present.length) return out;
  const r = await git(wt.toplevel, ['hash-object', '--stdin-paths'], present.join('\n') + '\n');
  const ids = r.code === 0 ? r.stdout.toString('utf8').trim().split('\n') : [];
  present.forEach((f, i) => (out[f] = ids[i] ?? null));
  return out;
}

export const untrackedFiles = async (wt: Worktree) =>
  zList((await git(wt.toplevel, ['ls-files', '--others', '--exclude-standard', '-z', ...wt.pathspec])).stdout);

/**
 * HEAD, branch and a fingerprint of everything not committed: the binary diff
 * against HEAD plus the untracked files and their hashes. Two states with the
 * same head and fingerprint have the same code.
 */
export async function readTreeState(wt: Worktree): Promise<GitTreeState> {
  const head = (await gitText(wt.toplevel, ['rev-parse', '--verify', '-q', 'HEAD'])) || null;
  const branch = (await gitText(wt.toplevel, ['symbolic-ref', '-q', '--short', 'HEAD'])) || null;
  const against = head ?? (await emptyTree(wt));
  const diff = await git(wt.toplevel, ['diff', '--binary', '--no-color', '--end-of-options', against, ...wt.pathspec]);
  const names = zList(
    (await git(wt.toplevel, ['diff', '--name-only', '-z', '--no-renames', '--end-of-options', against, ...wt.pathspec]))
      .stdout,
  );
  const untracked = await untrackedFiles(wt);
  const dirty = await hashFiles(wt, [...new Set([...names, ...untracked])].sort());
  const h = createHash('sha256').update(diff.stdout);
  for (const f of untracked.sort()) h.update(`\0untracked\0${f}\0${dirty[f]}`);
  return { toplevel: wt.toplevel, head, branch, fingerprint: `sha256:${h.digest('hex')}`, dirty };
}
