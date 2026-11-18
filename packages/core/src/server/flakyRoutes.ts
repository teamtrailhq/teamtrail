import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFlakyChecks } from '../flaky/readFlakyChecks';
import { sendJson } from './http';
import type { RouteContext } from './routeContext';

/**
 * `GET /flaky-checks`: the checks that failed and passed on the same code within a ticket, across the project
 * (flaky/flakyRows.ts), from the attempts on this machine. Read-only. False when the path doesn't match.
 */
export async function handleFlakyChecks(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname !== '/flaky-checks' || req.method !== 'GET') return false;
  sendJson(res, 200, await readFlakyChecks(ctx.root, await ctx.active()));
  return true;
}
