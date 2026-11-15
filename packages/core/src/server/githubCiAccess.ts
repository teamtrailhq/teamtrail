import { GitHubCiProvider } from '../evidence/github/GitHubCiProvider';
import type { CiProvider } from '../model/prEvidence';
import { githubRepoToken } from './githubRepoToken';
import type { TrackerContext } from './trackerContext';
import type { CiAccess } from './watchVerification';

/** The reconciler's GitHub reader (githubRepoToken.ts), made again only when the repo or token changes. */
export function githubCiAccess(ctx: TrackerContext): CiAccess {
  let cached: { key: string; provider: CiProvider } | undefined;
  return async () => {
    const r = await githubRepoToken(ctx);
    if (typeof r === 'string') return r;
    if (cached?.key !== r.key)
      cached = {
        key: r.key,
        provider: new GitHubCiProvider({ repo: r.repo, token: r.token, apiUrl: ctx.apiUrl.github, fetch: ctx.o.fetch }),
      };
    return cached.provider;
  };
}
