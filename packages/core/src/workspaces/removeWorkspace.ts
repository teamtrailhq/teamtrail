import { existsSync } from 'node:fs';
import path from 'node:path';
import { readLease } from '../agents/leaseStore';
import { git, gitText } from '../evidence/git';
import { ownWorktree } from './ownWorktree';
import type { WorkspaceRecord } from './workspace';
import { dropWorkspace, readWorkspace } from './workspaceStore';

export interface RemoveWorkspaceInput {
  root: string;
  mapId: string;
  ticketId: string;
  /** Remove even with uncommitted changes in the folder (the trail lead confirmed losing them). */
  force?: boolean;
}

export type RemoveWorkspaceResult =
  { kind: 'removed'; workspace: WorkspaceRecord } | { kind: 'refused'; reason: string; dirty?: boolean };

const refused = (reason: string, dirty?: boolean): RemoveWorkspaceResult => ({ kind: 'refused', reason, dirty });

/** True while an agent holds the ticket: a lease that hasn't been returned to the queue. */
export const isClaimed = (root: string, mapId: string, ticketId: string) => {
  const lease = readLease(root, mapId, ticketId);
  return !!lease && !lease.returned;
};

/**
 * The trail lead's "Remove workspace": deletes a finished ticket's worktree folder (`git worktree remove`, then
 * `prune`) and forgets it. The branch stays: Teamtrail never deletes branches, merges or pushes. Refuses while the
 * ticket is claimed, for the main checkout, and for uncommitted changes unless `force`.
 */
export async function removeWorkspace(i: RemoveWorkspaceInput): Promise<RemoveWorkspaceResult> {
  const ws = readWorkspace(i.root, i.mapId, i.ticketId);
  if (!ws) return refused('This ticket has no workspace.');
  if (isClaimed(i.root, i.mapId, i.ticketId))
    return refused(`${ws.ticketKey} is still claimed. Finish it or release it to the queue first.`);
  if (typeof ws.path !== 'string' || !path.isAbsolute(ws.path))
    return refused("This ticket's workspace record doesn't name a folder, so Teamtrail won't remove anything.");
  if (!existsSync(ws.path)) {
    dropWorkspace(i.root, i.mapId, i.ticketId);
    return { kind: 'removed', workspace: ws };
  }
  const repo = await ownWorktree(i.root, ws.path);
  if (!repo) return refused(`${ws.path} is not one of this repo's worktree folders, so Teamtrail won't remove it.`);
  const changes = (await gitText(ws.path, ['status', '--porcelain'])) ?? '';
  if (changes && !i.force) {
    const n = changes.split('\n').length;
    return refused(`${ws.path} has uncommitted changes (${n} ${n === 1 ? 'file' : 'files'}).`, true);
  }
  const r = await git(repo, ['worktree', 'remove', ...(i.force ? ['--force'] : []), '--end-of-options', ws.path]);
  if (r.code !== 0) return refused(r.stderr.trim().split('\n')[0] || 'git worktree remove failed');
  await git(repo, ['worktree', 'prune']);
  dropWorkspace(i.root, i.mapId, i.ticketId);
  return { kind: 'removed', workspace: ws };
}
