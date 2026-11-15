import { GitHubProofPublisher } from '../evidence/github/GitHubProofPublisher';
import type { ProofPublisher } from '../model/proofPost';
import { githubRepoToken } from './githubRepoToken';
import type { TrackerContext } from './trackerContext';

/** Who posts proofs to pull requests, or why nobody can: the same repo and token as the reconciler's reads. */
export type ProofAccess = () => Promise<ProofPublisher | string>;

export function githubProofAccess(ctx: TrackerContext): ProofAccess {
  let cached: { key: string; publisher: ProofPublisher } | undefined;
  return async () => {
    const r = await githubRepoToken(ctx);
    if (typeof r === 'string') return r;
    if (cached?.key !== r.key)
      cached = {
        key: r.key,
        publisher: new GitHubProofPublisher({
          repo: r.repo,
          token: r.token,
          apiUrl: ctx.apiUrl.github,
          fetch: ctx.o.fetch,
        }),
      };
    return cached.publisher;
  };
}
