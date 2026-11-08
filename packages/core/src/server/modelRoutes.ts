import type { IncomingMessage, ServerResponse } from 'node:http';
import { readAgentDocs } from '../agents/agentDocs';
import { connectedAgents } from '../agents/connectedAgents';
import { MODELS_FILE } from '../model/modelTier';
import { readModelsConfig } from '../planning/matching/modelsStore';
import type { ModelsView } from '../planning/matching/modelsView';
import { modelWaits } from '../planning/matching/modelWaits';
import { sendJson } from './http';
import type { RouteContext } from './routeContext';

/**
 * `GET /models`: model matching as the Lookout shows it (ModelsView). Read-only: the trail's toggle and tiers are
 * trail fields set through the tracker, and `models.json` is changed in the repo. False when the path doesn't match.
 */
export async function handleModels(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname !== '/models' || req.method !== 'GET') return false;
  const adapter = await ctx.active();
  const snaps = await Promise.all((await adapter.listMaps()).map((m) => adapter.loadMap(m.id)));
  const agents = connectedAgents(await readAgentDocs(ctx.root));
  const view: ModelsView = {
    file: MODELS_FILE,
    ...readModelsConfig(ctx.root),
    agents,
    waiting: snaps.flatMap((s) => modelWaits(s, agents)),
  };
  sendJson(res, 200, view);
  return true;
}
