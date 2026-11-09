import type { CredentialSource, GitHubRepoList } from '@teamtrail/core';
import { trackerApi } from './trackerApi';
import { useLookup } from './useLookup';

/**
 * The repos the found GitHub token can track issues in; `list` is undefined while loading or when `enabled` is off.
 * `auth` is where the token came from: signing in or out asks again.
 */
export function useGitHubRepos(o: { enabled: boolean; auth: CredentialSource | null }) {
  const { value: list, retry } = useLookup<GitHubRepoList>({
    enabled: o.enabled,
    key: o.auth ?? '',
    load: () => trackerApi.githubRepos(),
    failed: (error) => ({ kind: 'error', error }),
  });
  return { list, retry };
}
