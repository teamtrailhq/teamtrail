import { git, gitText } from '../evidence/git';
import { defaultHead } from '../mainChecks/defaultHead';
import { isObjectId } from '../workspaces/gitNames';

/** The default branch at a commit, and which of the commits asked for it contains. */
export type TrailHead = { top: string; branch: string; commit: string; contained: Set<string> } | { note: string };

/** Whether `ancestor` is in `head`'s history; an unknown commit is not. */
async function contains(top: string, head: string, ancestor: string) {
  if (!isObjectId(ancestor)) return false;
  const r = await git(top, ['merge-base', '--is-ancestor', '--end-of-options', ancestor, head]);
  return r.code === 0;
}

async function containedIn(top: string, head: string, commits: string[]) {
  const out = new Set<string>();
  for (const c of commits) if (await contains(top, head, c)) out.add(c);
  return out;
}

/**
 * The default branch's head to run a trail's checks on, as this checkout knows it (nothing is fetched): the local
 * branch, else the remote one when it holds more of `commits` (merged on the code host, not pulled yet). Says which
 * of `commits` it contains.
 */
export async function trailHead(repoRoot: string, commits: string[]): Promise<TrailHead> {
  const head = await defaultHead(repoRoot);
  if ('note' in head) return head;
  const best = { ...head, contained: await containedIn(head.top, head.commit, commits) };
  if (best.contained.size === commits.length) return best;
  const remote = await gitText(head.top, [
    'rev-parse',
    '--verify',
    '--quiet',
    '--end-of-options',
    `refs/remotes/origin/${head.branch}^{commit}`,
  ]);
  if (!remote || !isObjectId(remote) || remote === head.commit) return best;
  const there = await containedIn(head.top, remote, commits);
  return there.size > best.contained.size ? { ...head, commit: remote, contained: there } : best;
}
