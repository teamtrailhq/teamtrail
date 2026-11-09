import type { CredentialSource, GitHubRepoOption, TrackerSettings } from '@teamtrail/core';

type GitHubSettings = TrackerSettings['github'];

/** Where a GitHub token came from, as it reads inside a sentence. The token itself never reaches the page. */
const FROM: Record<CredentialSource, string> = {
  gh: 'your gh login',
  GITHUB_TOKEN: 'GITHUB_TOKEN',
  GH_TOKEN: 'GH_TOKEN',
  stored: 'a saved token',
  'signed-in': 'your GitHub sign-in',
  LINEAR_API_KEY: 'LINEAR_API_KEY',
};

export const tokenFrom = (source: CredentialSource) => FROM[source];

/** The login behind the found token, when GitHub said who it is. */
export function loginOf(gh: GitHubSettings): string | undefined {
  return gh.account?.kind === 'user' ? gh.account.login : undefined;
}

/** A token was found and GitHub accepted it, so the picker can list repos. */
export const tokenWorks = (gh: GitHubSettings) => !!gh.auth && !!loginOf(gh);

/** Before connecting: "Will use owner/name as login (your gh login)". */
export function willUse(gh: GitHubSettings, repo: string | undefined): string | undefined {
  const login = loginOf(gh);
  if (!gh.auth || !login) return undefined;
  const target = repo || 'the repo you pick';
  return `Will use ${target} as ${login} (${tokenFrom(gh.auth)})`;
}

/** Once connected: "Connected to owner/name as login, using your gh login". */
export function connectedAs(gh: GitHubSettings): string | undefined {
  if (!gh.repo) return undefined;
  const login = loginOf(gh);
  const who = login ? ` as ${login}` : '';
  const how = gh.auth ? `, using ${tokenFrom(gh.auth)}` : '';
  return `Connected to ${gh.repo}${who}${how}`;
}

/** "Pushed today", "Pushed 4d ago", "Pushed 3mo ago". */
export function pushedLabel(r: GitHubRepoOption, now: number): string | undefined {
  if (!r.pushedAt) return undefined;
  const days = Math.floor((now - Date.parse(r.pushedAt)) / 86_400_000);
  if (days < 1) return 'Pushed today';
  if (days < 60) return `Pushed ${days}d ago`;
  return `Pushed ${Math.floor(days / 30)}mo ago`;
}
