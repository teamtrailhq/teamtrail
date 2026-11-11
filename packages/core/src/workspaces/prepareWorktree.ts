import { existsSync } from 'node:fs';
import path from 'node:path';
import { git, gitText } from '../evidence/git';
import { isBranchName, isTicketSlug } from './gitNames';
import { recordWorktree, trustedWorkspace } from './trustedWorkspace';
import type { Workspace, WorkspaceSettings } from './workspace';
import { writeWorkspace } from './workspaceStore';
import { worktreeDir } from './worktreeDir';

export interface PrepareInput {
  /** Tracker folder: where the workspace record is kept. */
  root: string;
  /** The repo the worktree branches from. */
  repoRoot: string;
  settings: WorkspaceSettings;
  mapId: string;
  ticket: { id: string; key: string };
  agent: string;
  now?: number;
}

export type Prepared = { workspace: Workspace } | { note: string };

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'trail';

type Location = { branch: string; path: string } | { note: string };

/**
 * The branch and folder a ticket's worktree uses: `teamtrail/<trail>/<n>` in `<repo>.teamtrail/<trail>-<n>`.
 * Both come from files others write (the ticket's id, workspaces.json), so both are checked before git sees
 * them: an id that isn't one plain segment, or a folder outside the repo's parent, gets a note instead.
 */
export function worktreeLocation(top: string, settings: WorkspaceSettings, mapId: string, key: string): Location {
  const slug = slugOf(mapId);
  const n = key.replace(/^#/, '');
  const branch = `teamtrail/${slug}/${n}`;
  if (!isTicketSlug(n) || !isBranchName(branch))
    return { note: `No workspace: ticket id ${JSON.stringify(key)} can't name a branch. Work in the repo.` };
  const where = worktreeDir(top, settings.dir);
  if ('refused' in where) return { note: `No workspace: ${where.refused} Work in the repo.` };
  return { branch, path: path.join(where.dir, `${slug}-${n}`) };
}

/**
 * A git worktree and branch for one claimed ticket, created from HEAD next to the repo. Claiming again reuses it.
 * Never merges, pushes or deletes anything. When there's no repo (or no commit, or git fails), says why instead.
 */
export async function prepareWorktree(i: PrepareInput): Promise<Prepared> {
  const known = trustedWorkspace(i.root, i.mapId, i.ticket.id);
  if (known) return { workspace: pick(known) };
  const top = await gitText(i.repoRoot, ['rev-parse', '--show-toplevel']);
  if (!top) return { note: 'No workspace: this folder is not a git repository (or git is missing). Work in the repo.' };
  const head = await gitText(top, ['rev-parse', 'HEAD']);
  if (!head) return { note: 'No workspace: the repository has no commits yet. Work in the repo.' };
  const where = worktreeLocation(top, i.settings, i.mapId, i.ticket.key);
  if ('note' in where) return where;
  const made = await addWorktree(top, where, head);
  if ('note' in made) return made;
  writeWorkspace(i.root, {
    v: 1,
    mapId: i.mapId,
    ticketId: i.ticket.id,
    ticketKey: i.ticket.key,
    agent: i.agent,
    createdAt: i.now ?? Date.now(),
    ...made.workspace,
  });
  recordWorktree(i.root, { mapId: i.mapId, ticketId: i.ticket.id, path: made.workspace.path });
  return made;
}

/** Adds the worktree, reusing the branch (and a folder already on it) when they exist from an earlier claim. */
async function addWorktree(top: string, where: { branch: string; path: string }, head: string): Promise<Prepared> {
  if (existsSync(where.path)) {
    const onBranch = await gitText(where.path, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (onBranch === where.branch) return { workspace: { ...where, base: await baseOf(where.path, head) } };
    return { note: `No workspace: ${where.path} already exists and isn't on ${where.branch}. Work in the repo.` };
  }
  const ref = `refs/heads/${where.branch}`;
  const branchExists = (await git(top, ['show-ref', '--verify', '--quiet', '--end-of-options', ref])).code === 0;
  const r = branchExists
    ? await git(top, ['worktree', 'add', '--end-of-options', where.path, where.branch])
    : await git(top, ['worktree', 'add', '-b', where.branch, '--end-of-options', where.path, head]);
  if (r.code !== 0) {
    const why = r.stderr.trim().split('\n')[0] || 'git worktree add failed';
    return { note: `No workspace: ${why}. Work in the repo.` };
  }
  const base = branchExists ? await baseOf(where.path, head) : head;
  return { workspace: { ...where, base } };
}

/** Where a reused branch forked from the repo's HEAD. */
async function baseOf(cwd: string, head: string) {
  return (await gitText(cwd, ['merge-base', '--end-of-options', head, 'HEAD'])) ?? head;
}

const pick = (w: Workspace): Workspace => ({ path: w.path, branch: w.branch, base: w.base });
