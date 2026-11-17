import { existsSync, lstatSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { git } from '../evidence/git';
import { machineStore } from '../machine/machineStore';
import { forgetWorktree, preparedWorktree, recordWorktree } from '../workspaces/trustedWorkspace';
import { readWorkspaceSettings } from '../workspaces/workspaceStore';
import { worktreeDir } from '../workspaces/worktreeDir';

/** The key the prepared worktree is recorded under in worktrees.json: no trail is called this. */
export const MAIN_WORKTREE_KEY = '_main';

/** Folders a fresh checkout lacks and checks need: linked from the repo's own, never copied or installed. */
const DEPENDENCIES = new Set(['node_modules', '.venv']);
const SKIP = new Set(['.git', '.teamtrail', 'node_modules', '.venv', 'dist', 'build']);
const DEPTH = 3;

export type MainWorktree = { path: string; links: string[] } | { note: string };

/** The dependency folders under `top`, a few levels deep (a monorepo's packages), as paths relative to it. */
function dependencyFolders(top: string, rel = '', depth = 0): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(path.join(top, rel));
  } catch {
    return [];
  }
  const found = names.filter((n) => DEPENDENCIES.has(n)).map((n) => path.join(rel, n));
  if (depth >= DEPTH) return found;
  const deeper = names
    .filter((n) => !SKIP.has(n) && !n.startsWith('.'))
    .filter((n) => lstatSync(path.join(top, rel, n), { throwIfNoEntry: false })?.isDirectory())
    .flatMap((n) => dependencyFolders(top, path.join(rel, n), depth + 1));
  return [...found, ...deeper];
}

/** Links the repo's dependency folders into the worktree where the same parent folder exists and nothing is there. */
function linkDependencies(top: string, wt: string): string[] {
  const links: string[] = [];
  for (const rel of dependencyFolders(top)) {
    const at = path.join(wt, rel);
    if (!existsSync(path.dirname(at)) || lstatSync(at, { throwIfNoEntry: false })) continue;
    try {
      symlinkSync(path.join(top, rel), at, 'dir');
      links.push(at);
    } catch {
      // a check that needs it fails as it would in a fresh clone
    }
  }
  return links;
}

/**
 * A detached worktree at `commit` next to the repo (where ticket worktrees go), recorded in worktrees.json as one
 * Teamtrail prepared, with the repo's dependency folders linked in. Never the user's working tree.
 */
export async function prepareMainWorktree(o: {
  root: string;
  top: string;
  commit: string;
  id: string;
}): Promise<MainWorktree> {
  const where = worktreeDir(o.top, readWorkspaceSettings(o.root).settings.dir);
  if ('refused' in where) return { note: where.refused };
  const dir = path.join(where.dir, `_main-${o.commit.slice(0, 12)}-${o.id.slice(-6)}`);
  if (existsSync(dir)) return { note: `${dir} already exists` };
  const r = await git(o.top, ['worktree', 'add', '--detach', '--end-of-options', dir, o.commit]);
  if (r.code !== 0) return { note: r.stderr.trim().split('\n')[0] || 'git worktree add failed' };
  recordWorktree(o.root, { mapId: MAIN_WORKTREE_KEY, ticketId: o.id, path: dir });
  const prepared = preparedWorktree(o.root, MAIN_WORKTREE_KEY, o.id);
  if (!prepared) return { note: 'the worktree could not be recorded on this machine' };
  return { path: prepared, links: linkDependencies(o.top, prepared) };
}

/** Worktrees an earlier run left behind (its process ended mid-run), removed before a new run: links and all. */
export async function sweepMainWorktrees(o: { root: string; top: string }) {
  let known: Record<string, string> = {};
  try {
    known = machineStore(o.root).read<Record<string, string>>('worktrees.json') ?? {};
  } catch {
    return;
  }
  const prefix = `${MAIN_WORKTREE_KEY}--`;
  for (const key of Object.keys(known).filter((k) => k.startsWith(prefix))) {
    const dir = known[key];
    const links = dependencyFolders(o.top)
      .map((rel) => path.join(dir, rel))
      .filter((p) => lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink());
    await removeMainWorktree({ ...o, id: key.slice(prefix.length), links });
  }
}

/** Removes the worktree again: the links first (never what they point to), then the folder, then the record. */
export async function removeMainWorktree(o: { root: string; top: string; id: string; links: string[] }) {
  for (const l of o.links) if (lstatSync(l, { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(l);
  const dir = preparedWorktree(o.root, MAIN_WORKTREE_KEY, o.id);
  if (dir) await git(o.top, ['worktree', 'remove', '--force', '--end-of-options', dir]);
  await git(o.top, ['worktree', 'prune']);
  forgetWorktree(o.root, { mapId: MAIN_WORKTREE_KEY, ticketId: o.id });
}
