import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleRepoProfile } from './repoProfileRoute';
import type { RouteContext } from './routeContext';
import { handleScreen } from './verificationScreenRoute';

/**
 * The routes that read the repository's files (RouteContext `repoFiles`), never write them: screening checks being
 * set (`POST /verification/screen`) and the repo profile with its suggested checks (`GET /repo/profile`).
 */
export async function handleRepoReads(
  ctx: Pick<RouteContext, 'repoFiles'>,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  return (await handleScreen(ctx, req, res, url)) || handleRepoProfile(ctx, req, res, url);
}
