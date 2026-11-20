import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleCheckVariables, type CheckVariablesContext } from './checkVariablesRoute';
import { handleRepoProfile } from './repoProfileRoute';
import type { RouteContext } from './routeContext';
import { handleScreen } from './verificationScreenRoute';

/**
 * The routes that read the repository's files (RouteContext `repoFiles`), never write them: screening checks being
 * set (`POST /verification/screen`), the repo profile with its suggested checks (`GET /repo/profile`), and the
 * variables checks may read with the names the profile saw tests reference (`/verification/variables`, whose list
 * is kept in the machine store, never the repo).
 */
export async function handleRepoReads(
  ctx: Pick<RouteContext, 'repoFiles'> & CheckVariablesContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  return (
    (await handleScreen(ctx, req, res, url)) ||
    (await handleRepoProfile(ctx, req, res, url)) ||
    handleCheckVariables(ctx, req, res, url)
  );
}
