import type { IncomingMessage, ServerResponse } from 'node:http';
import { detectRepoProfile, suggestChecks } from '../repoProfile';
import { sendJson } from './http';
import type { RouteContext } from './routeContext';

/**
 * `GET /repo/profile` → `{profile, suggestions}`: what reading the repo's files says it is (repoProfile/, units,
 * workspaces, CI, needs) and the checks that suggests (CheckSuggestion[], each with its folder). Read-only: nothing
 * runs and nothing is written; paths are repo-relative, variable names come without values. `{profile: null,
 * suggestions: []}` without a checkout to read.
 */
export async function handleRepoProfile(
  ctx: Pick<RouteContext, 'repoFiles'>,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (url.pathname !== '/repo/profile' || req.method !== 'GET') return false;
  const files = ctx.repoFiles?.();
  if (!files) return (sendJson(res, 200, { profile: null, suggestions: [] }), true);
  const profile = await detectRepoProfile(files);
  sendJson(res, 200, { profile, suggestions: suggestChecks(profile) });
  return true;
}
