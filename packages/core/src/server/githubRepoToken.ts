import type { TrackerContext } from './trackerContext';

/**
 * The GitHub repo and token Teamtrail reads PRs and posts proofs with: the repo approved as this machine's tracker
 * (trackerPin.ts), else the `origin` remote; the token from Settings, the environment or `gh auth token`. Or why
 * there is none. The token stays in this process's memory, never in evidence files.
 */
export async function githubRepoToken(ctx: TrackerContext) {
  const approved = ctx.pin.read().config;
  const repo = (approved.active === 'github' ? approved.github?.repo : undefined) ?? (await ctx.detectedRepo());
  if (!repo) return 'no GitHub repository: connect one in Settings or add a github.com origin remote';
  const t = await ctx.githubToken();
  if (!t) return 'no GitHub token: run `gh auth login`, set GITHUB_TOKEN, or paste one in Settings';
  return { repo, token: t.token, key: `${repo}\n${t.source}\n${t.token}` };
}
