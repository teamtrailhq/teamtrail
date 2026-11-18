import { git, gitText } from '../evidence/git';
import { isBranchName, isObjectId } from '../workspaces/gitNames';

export type DefaultHead = { top: string; branch: string; commit: string } | { note: string };

/** The remote's default branch as this clone last heard it (`origin/HEAD`), without asking the network. */
async function remoteDefault(top: string) {
  const ref = await gitText(top, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const name = ref?.replace(/^origin\//, '');
  return name && isBranchName(name) ? name : undefined;
}

async function commitOf(top: string, ref: string) {
  const sha = await gitText(top, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
  return sha && isObjectId(sha) ? sha : undefined;
}

/** The remote's branch when it is ahead of the local one (holds it and more): merged on the code host, not pulled. */
async function aheadOnRemote(top: string, branch: string, local: string) {
  const remote = await commitOf(top, `refs/remotes/origin/${branch}`);
  if (!remote || remote === local) return undefined;
  const r = await git(top, ['merge-base', '--is-ancestor', '--end-of-options', local, remote]);
  return r.code === 0 ? remote : undefined;
}

/**
 * The default branch and its head commit, as this checkout knows them: the remote's default branch (a local branch
 * of that name first, unless the remote one is ahead of it; else the remote one), else a local `main` or `master`.
 * Nothing is fetched. The one place the default branch's head is read: checks on main, trail checks (trailHead.ts)
 * and reverts (scorecard/readReverts.ts) all start here, so they see the same commit.
 */
export async function defaultHead(repoRoot: string): Promise<DefaultHead> {
  const top = await gitText(repoRoot, ['rev-parse', '--show-toplevel']);
  if (!top) return { note: 'this folder is not a git repository (or git is missing)' };
  const remote = await remoteDefault(top);
  const candidates = remote
    ? [
        { branch: remote, ref: `refs/heads/${remote}` },
        { branch: remote, ref: `refs/remotes/origin/${remote}` },
      ]
    : [
        { branch: 'main', ref: 'refs/heads/main' },
        { branch: 'master', ref: 'refs/heads/master' },
      ];
  for (const c of candidates) {
    const commit = await commitOf(top, c.ref);
    if (!commit) continue;
    const ahead = c.ref.startsWith('refs/heads/') ? await aheadOnRemote(top, c.branch, commit) : undefined;
    return { top, branch: c.branch, commit: ahead ?? commit };
  }
  return { note: `no default branch found (${candidates.map((c) => c.branch).join(' or ')})` };
}
