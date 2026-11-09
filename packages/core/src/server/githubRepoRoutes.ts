import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GitHubLookups } from './githubLookups';
import { sendJson } from './http';

/**
 * `GET /trackers/github/repos`: the repos the found GitHub token can track issues in (GitHubRepoList), with the
 * login and where the token came from. Read-only and cached briefly; the token itself never leaves the process.
 */
export async function handleGitHubRepos(
  req: IncomingMessage,
  res: ServerResponse,
  o: { path: string; lookups: GitHubLookups },
): Promise<boolean> {
  if (o.path !== '/trackers/github/repos') return false;
  if (req.method !== 'GET') return (sendJson(res, 405, { error: 'method not allowed' }), true);
  sendJson(res, 200, await o.lookups.repos());
  return true;
}
