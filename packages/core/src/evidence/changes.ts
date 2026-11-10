import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ChangedFile, GitTreeState } from '../model/evidence';
import { git, gitText } from './git';
import { emptyTree, hashFiles, untrackedFiles, type Worktree } from './treeState';

/** `git diff --numstat -z` lines: `add\tdel\tpath\0`, `-` counts for binary files. */
function numstat(out: Buffer) {
  const rows = new Map<string, { add: number | null; del: number | null }>();
  for (const line of out.toString('utf8').split('\0')) {
    const m = line.match(/^(-|\d+)\t(-|\d+)\t(.+)$/s);
    if (m) rows.set(m[3], { add: m[1] === '-' ? null : Number(m[1]), del: m[2] === '-' ? null : Number(m[2]) });
  }
  return rows;
}

/** Lines of a new file; `null` when it looks binary. */
function lineCount(wt: Worktree, f: string) {
  try {
    const b = readFileSync(path.join(wt.toplevel, f));
    if (b.includes(0)) return null;
    const text = b.toString('utf8');
    return text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
  } catch {
    return null;
  }
}

/**
 * Files changed since `base` (the worktree at claim), with line counts
 * against the base head: commits made since, staged and unstaged edits, and
 * new untracked files. Files that were already dirty at claim and are unchanged
 * since are left out.
 */
export async function changesSince(wt: Worktree, now: GitTreeState, base: GitTreeState): Promise<ChangedFile[]> {
  let from = base.head ?? (await emptyTree(wt));
  if (base.head && (await gitText(wt.toplevel, ['cat-file', '-t', '--end-of-options', base.head])) !== 'commit')
    from = now.head ?? (await emptyTree(wt));
  const stats = numstat(
    (await git(wt.toplevel, ['diff', '--numstat', '-z', '--no-renames', '--end-of-options', from, ...wt.pathspec]))
      .stdout,
  );
  const fresh = (await untrackedFiles(wt)).filter((f) => !stats.has(f));
  const claimed = Object.keys(base.dirty);
  const current = await hashFiles(wt, claimed);
  const out = new Map<string, ChangedFile>();
  for (const [f, s] of stats) out.set(f, { path: f, ...s });
  for (const f of fresh) out.set(f, { path: f, add: lineCount(wt, f), del: 0, untracked: true });
  for (const f of claimed) {
    if (current[f] === base.dirty[f]) out.delete(f);
    else out.set(f, { ...(out.get(f) ?? { path: f, add: null, del: null }), dirtyAtClaim: true });
  }
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function statsOf(changed: ChangedFile[]) {
  return {
    files: changed.length,
    add: changed.reduce((n, c) => n + (c.add ?? 0), 0),
    del: changed.reduce((n, c) => n + (c.del ?? 0), 0),
  };
}
