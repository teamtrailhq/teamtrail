import type { IncomingMessage, ServerResponse } from 'node:http';
import { decisionMemory } from '../precedent/decisionMemory';
import { precedentAreas } from '../precedent/precedentAreas';
import { sendJson } from './http';
import type { RouteContext } from './routeContext';

/**
 * `GET /decision-memory`: each decision's area and the later decisions that cite it, keyed `<mapId>/<id>`, for the
 * Logbook's By area view (precedent/decisionMemory.ts). Read-only. False when the path doesn't match.
 */
export async function handleDecisionMemory(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname !== '/decision-memory' || req.method !== 'GET') return false;
  const adapter = await ctx.active();
  const maps = await adapter.listMaps();
  const decisions = (await Promise.all(maps.map((m) => adapter.listDecisions(m.id)))).flat();
  const memory = decisionMemory(decisions, precedentAreas(ctx.root, decisions));
  sendJson(res, 200, { entries: Object.fromEntries(memory) });
  return true;
}
