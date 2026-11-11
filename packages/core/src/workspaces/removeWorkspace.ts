import { existsSync } from 'node:fs';
import path from 'node:path';
import { readLease } from '../agents/leaseStore';
import { git, gitText } from '../evidence/git';
import { BRAND } from '../model/brand';
import { ownWorktree } from './ownWorktree';
import { trustedWorkspace } from './trustedWorkspace';
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
  const record = readWorkspace(i.root, i.mapId, i.ticketId);
  if (!record) return refused('This ticket has no workspace.');
  // only a worktree Teamtrail prepared here: a record an agent wrote can't point removal at another folder
  const ws = existsSync(record.path) ? trustedWorkspace(i.root, i.mapId, i.ticketId) : record;
  if (!ws)
    return refused(`${record.path} isn't a worktree ${BRAND.name} prepared for this ticket, so it won't remove it.`);
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
  // --force always: cleanliness was checked just above, and without it git checks again with a status of its own
  // inside the worktree, where that worktree's own config could run a filter.
  const r = await git(repo, ['worktree', 'remove', '--force', '--end-of-options', ws.path]);
  if (r.code !== 0) return refused(r.stderr.trim().split('\n')[0] || 'git worktree remove failed');
  await git(repo, ['worktree', 'prune']);
  dropWorkspace(i.root, i.mapId, i.ticketId);
  return { kind: 'removed', workspace: ws };
}
