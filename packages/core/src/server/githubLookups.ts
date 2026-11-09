import { describeError } from '../adapters/remote/describeError';
import { githubAccount } from '../adapters/remote/github/githubAccount';
import { listGitHubRepos } from '../adapters/remote/github/listGitHubRepos';
import type { GitHubAccount, GitHubRepoList } from '../adapters/remote/types';
import type { TrackerContext } from './trackerContext';

const ACCOUNT_MS = 5 * 60_000;
const REPOS_MS = 60_000;
/** A failed account lookup is retried sooner: the network or the token may be back. */
const FAILED_MS = 15_000;
/** A failed repo list isn't kept, so the picker's Retry asks GitHub again. */
const FAILED_LIST_MS = 0;

type FoundToken = NonNullable<Awaited<ReturnType<TrackerContext['githubToken']>>>;

interface Cached<T> {
  token: string;
  at: number;
  ttl: number;
  value: Promise<T>;
}

/**
 * Who the found GitHub token signs in as and which repos it can track, each cached briefly per token so the
 * Settings poll and the picker don't spend the rate limit. Tokens stay in this process; results carry none.
 */
export function githubLookups(ctx: TrackerContext) {
  let account: Cached<GitHubAccount> | undefined;
  let repos: Cached<GitHubRepoList> | undefined;
  const fresh = <T>(c: Cached<T> | undefined, token: string): c is Cached<T> =>
    !!c && c.token === token && Date.now() - c.at < c.ttl;
  const settle = <T>(c: Cached<T>, o: { failed: (v: T) => boolean; ttl: number }) =>
    void c.value.then((v) => {
      if (o.failed(v)) c.ttl = o.ttl;
    });

  function accountFor(token: string): Promise<GitHubAccount> {
    if (fresh(account, token)) return account.value;
    const value = githubAccount({ token, apiUrl: ctx.apiUrl.github, fetch: ctx.o.fetch });
    account = { token, at: Date.now(), ttl: ACCOUNT_MS, value };
    settle(account, { failed: (v) => v.kind !== 'user', ttl: FAILED_MS });
    return value;
  }

  async function listFor(found: FoundToken): Promise<GitHubRepoList> {
    const { token, source: auth } = found;
    try {
      const [acct, list, detectedRepo] = await Promise.all([
        accountFor(token),
        listGitHubRepos({ token, apiUrl: ctx.apiUrl.github, fetch: ctx.o.fetch }),
        ctx.detectedRepo(),
      ]);
      return { kind: 'ok', account: acct, auth, ...list, detectedRepo };
    } catch (err) {
      const { error, code } = describeError(err, 'GitHub');
      return { kind: 'error', auth, error: error ?? 'GitHub could not list your repositories', code };
    }
  }

  return {
    /** The account behind the found token, or undefined when there is none. */
    async account(): Promise<GitHubAccount | undefined> {
      const found = await ctx.githubToken();
      return found ? accountFor(found.token) : undefined;
    },
    async repos(): Promise<GitHubRepoList> {
      const found = await ctx.githubToken();
      if (!found) return { kind: 'no-token' };
      if (fresh(repos, found.token)) return repos.value;
      const value = listFor(found);
      repos = { token: found.token, at: Date.now(), ttl: REPOS_MS, value };
      settle(repos, { failed: (v) => v.kind !== 'ok', ttl: FAILED_LIST_MS });
      return value;
    },
    /** A token was saved or forgotten: look again. */
    reset() {
      account = undefined;
      repos = undefined;
    },
  };
}

export type GitHubLookups = ReturnType<typeof githubLookups>;
