import type { IncomingMessage, ServerResponse } from 'node:http';
import { proposeCommandNotes } from '../commandNotes/proposeCommandNotes';
import { OperationError } from '../planning/operations/operationError';
import { sendJson } from './http';
import type { RouteContext } from './routeContext';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

/**
 * `POST /knowledge/commands` → `{added, updated, unchanged}` (knowledge ids): suggests a knowledge entry of the
 * commands for each part of the repo, read from this checkout and the approved verification.json
 * (commandNotes/proposeCommandNotes.ts). Suggestions only: none reaches an agent until the trail lead confirms it.
 * This machine only (thisMachineRoutes.ts), never cross-site; 400 without a checkout to read.
 */
export async function handleCommandNotes(
  ctx: Pick<RouteContext, 'root' | 'repoFiles'> & { local?: boolean },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (url.pathname !== '/knowledge/commands' || req.method !== 'POST') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  if (ctx.local === false) return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
  try {
    sendJson(res, 200, await proposeCommandNotes({ root: ctx.root, files: ctx.repoFiles?.() }));
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, 400, { error: e.message });
  }
  return true;
}
