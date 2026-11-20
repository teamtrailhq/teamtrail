import type { IncomingMessage, ServerResponse } from 'node:http';
import { activeTrails } from '../model/activeTrails';
import { OperationError } from '../planning/operations/operationError';
import { applyReadinessFixes } from '../readiness/applyReadinessFixes';
import { readinessHold } from '../readiness/readinessHold';
import { readReadiness } from '../readiness/readReadiness';
import { startAnyway } from '../readiness/startAnyway';
import { StaleChecks } from '../verification/setChecks';
import { BadRequest, readJson, sendJson } from './http';
import { personOfRequest } from './requestPerson';
import type { RouteContext } from './routeContext';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

export interface ReadinessRouteContext extends RouteContext {
  /** False where checks run elsewhere (a server with its own runner): nothing about this machine is probed. */
  probe: boolean;
  local: boolean;
}

const read = (ctx: ReadinessRouteContext, fresh = false) =>
  readReadiness({ root: ctx.root, files: ctx.repoFiles?.(), probe: ctx.probe, fresh });

/** Readiness and, per active trail, how many ready tickets it holds and the trail lead's Start anyway. */
async function view(ctx: ReadinessRouteContext, fresh: boolean) {
  const readiness = await read(ctx, fresh);
  const adapter = await ctx.active();
  const maps = activeTrails(await adapter.listMaps());
  const trails = await Promise.all(
    maps.map(async (m) => {
      const hold = readinessHold({ root: ctx.root, snap: await adapter.loadMap(m.id), readiness });
      const started = hold.startedAnyway ? { startedAnyway: hold.startedAnyway } : {};
      return { mapId: m.id, title: m.title, held: hold.held.length, ...started };
    }),
  );
  return { readiness, trails };
}

const fixesOf = (v: unknown) => {
  if (!Array.isArray(v)) throw new BadRequest('"fixes" must list {id, hash}');
  return v.map((f) => {
    const x = (f ?? {}) as { id?: unknown; hash?: unknown };
    if (typeof x.id !== 'string' || typeof x.hash !== 'string') throw new BadRequest('"fixes" must list {id, hash}');
    return { id: x.id, hash: x.hash };
  });
};

async function fix(ctx: ReadinessRouteContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ fixes?: unknown; base?: unknown; acknowledged?: unknown }>(req, '{}');
  if (typeof b.base !== 'string') throw new BadRequest('"base" is required');
  try {
    await applyReadinessFixes({
      root: ctx.root,
      readiness: await read(ctx),
      fixes: fixesOf(b.fixes),
      base: b.base,
      acknowledged: b.acknowledged === true,
      files: ctx.repoFiles?.(),
      by: personOfRequest(req)?.name ?? 'trail lead',
    });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    return sendJson(res, e instanceof StaleChecks ? 409 : 400, { error: e.message });
  }
  sendJson(res, 200, await view(ctx, true));
}

async function start(ctx: ReadinessRouteContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ mapId?: unknown; undo?: unknown }>(req, '{}');
  if (typeof b.mapId !== 'string' || !b.mapId) throw new BadRequest('"mapId" is required');
  const maps = await (await ctx.active()).listMaps();
  if (!maps.some((m) => m.id === b.mapId)) return sendJson(res, 404, { error: 'no such trail' });
  const by = personOfRequest(req)?.name ?? 'trail lead';
  try {
    startAnyway({ root: ctx.root, mapId: b.mapId, readiness: await read(ctx), by, undo: b.undo === true });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    return sendJson(res, 400, { error: e.message });
  }
  sendJson(res, 200, await view(ctx, false));
}

/**
 * Repo readiness (readiness/):
 *   GET  /repo/readiness[?fresh=1]      `{readiness, trails}`: RepoReadiness, and per active trail the ready tickets
 *                                       it holds and the trail lead's Start anyway; `fresh` reads and probes again
 *   POST /repo/readiness/fix            `{fixes: [{id, hash}], base, acknowledged?}`: apply fixes as shown, writing
 *                                       verification.json and approving it in one step (applyReadinessFixes.ts)
 *   POST /repo/readiness/start-anyway   `{mapId, undo?}`: Start anyway past what blocks now, or its undo; journaled
 * Both writes answer this machine only (thisMachineRoutes.ts), never cross-site.
 */
export async function handleReadiness(
  ctx: ReadinessRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/repo/readiness')) return false;
  if (p === '/repo/readiness' && req.method === 'GET')
    return (sendJson(res, 200, await view(ctx, url.searchParams.get('fresh') === '1')), true);
  if (req.method !== 'POST') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  if (!ctx.local) return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
  if (p === '/repo/readiness/fix') return (await fix(ctx, req, res), true);
  if (p === '/repo/readiness/start-anyway') return (await start(ctx, req, res), true);
  return false;
}
