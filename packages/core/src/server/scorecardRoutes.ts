import type { IncomingMessage, ServerResponse } from 'node:http';
import { agentScorecard } from '../scorecard/agentScorecard';
import { scorecardInput } from '../scorecard/scorecardInput';
import { sendJson } from './http';
import type { RouteContext } from './routeContext';

/**
 * `GET /scorecard`: how each agent, model and vendor does on this repo's own tickets (scorecard/agentScorecard.ts),
 * from the attempts, verdicts and session records on this machine. Read-only. False when the path doesn't match.
 */
export async function handleScorecard(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname !== '/scorecard' || req.method !== 'GET') return false;
  sendJson(res, 200, agentScorecard(await scorecardInput(ctx.root, await ctx.active())));
  return true;
}
