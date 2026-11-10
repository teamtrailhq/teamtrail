import { zList, git } from '../evidence/git';
import { isBranchName, isObjectId } from './gitNames';
import type { WorkspaceRecord } from './workspace';

/**
 * Files a ticket's branch changed since it forked: `git diff --name-only <base>...<branch>` in its worktree.
 * The record is a file agents can write: a base that isn't a commit id or a branch that isn't a branch name is
 * no answer, and neither is ever read by git as an option.
 */
export async function branchChanges(ws: WorkspaceRecord): Promise<string[] | undefined> {
  if (!isObjectId(ws.base) || !isBranchName(ws.branch)) return undefined;
  const r = await git(ws.path, ['diff', '--name-only', '-z', '--end-of-options', `${ws.base}...${ws.branch}`]);
  return r.code === 0 ? zList(r.stdout) : undefined;
}
