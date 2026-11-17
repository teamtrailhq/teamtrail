import { gitText } from '../evidence/git';
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

/**
 * The default branch and its head commit, as this checkout knows them: the remote's default branch (a local branch
 * of that name first, else the remote one), else a local `main` or `master`. Nothing is fetched.
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
    if (commit) return { top, branch: c.branch, commit };
  }
  return { note: `no default branch found (${candidates.map((c) => c.branch).join(' or ')})` };
}
