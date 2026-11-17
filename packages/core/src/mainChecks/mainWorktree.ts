import { existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { git } from '../evidence/git';
import { machineStore } from '../machine/machineStore';
import { forgetWorktree, preparedWorktree, recordWorktree } from '../workspaces/trustedWorkspace';
import { readWorkspaceSettings } from '../workspaces/workspaceStore';
import { worktreeDir } from '../workspaces/worktreeDir';
import { dependencyFolders } from './dependencyFolders';

/** The key the prepared worktree is recorded under in worktrees.json: no trail is called this. */
export const MAIN_WORKTREE_KEY = '_main';

export type MainWorktree = { path: string; links: string[] } | { note: string };

/**
 * Links the repo's dependency folders into the worktree where the same parent folder exists (a folder tracked in git at
 * that commit) and nothing is there: `node_modules` at the root and in nested package folders like `apps/web`.
 */
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
