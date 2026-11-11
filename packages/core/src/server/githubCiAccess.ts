import { GitHubCiProvider } from '../evidence/github/GitHubCiProvider';
import type { CiProvider } from '../model/prEvidence';
import type { TrackerContext } from './trackerContext';
import type { CiAccess } from './watchVerification';

/**
 * The reconciler's GitHub reader: the repo approved as this machine's tracker (trackerPin.ts), else the
 * `origin` remote; the token from Settings, the environment or `gh auth
 * token`. The token stays in this process's memory, never in evidence files.
 */
export function githubCiAccess(ctx: TrackerContext): CiAccess {
  let cached: { key: string; provider: CiProvider } | undefined;
  return async () => {
    const approved = ctx.pin.read().config;
    const repo = (approved.active === 'github' ? approved.github?.repo : undefined) ?? (await ctx.detectedRepo());
    if (!repo) return 'no GitHub repository: connect one in Settings or add a github.com origin remote';
    const t = await ctx.githubToken();
    if (!t) return 'no GitHub token: run `gh auth login`, set GITHUB_TOKEN, or paste one in Settings';
    const key = `${repo}\n${t.source}\n${t.token}`;
    if (cached?.key !== key)
      cached = {
        key,
        provider: new GitHubCiProvider({ repo, token: t.token, apiUrl: ctx.apiUrl.github, fetch: ctx.o.fetch }),
      };
    return cached.provider;
  };
}
