import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MapSnapshot } from '../model/types';
import { approveTrust } from '../trust/approveTrust';
import { firstRun } from '../trust/firstRun';
import { pendingTrust } from '../trust/pendingTrust';
import { withCommitted } from '../trust/withCommitted';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

type Want = { key: string; hash: string };
const isWant = (v: unknown): v is Want =>
  !!v && typeof (v as Want).key === 'string' && typeof (v as Want).hash === 'string';

/** Every trail, for their verification levels; none when the tracker can't be read now. */
async function snapsOf(ctx: RouteContext): Promise<MapSnapshot[]> {
  try {
    const adapter = await ctx.active();
    return await Promise.all((await adapter.listMaps()).map((m) => adapter.loadMap(m.id)));
  } catch {
    return [];
  }
}

/**
 * `/trust`: what the project's files ask this machine to trust that the trail lead hasn't approved here.
 * GET lists the pending items (`{ items: TrustItem[] }`), each with the exact content it would approve and whether
 * its file is committed. POST `/trust/approve` `{ items: [{ key, hash }] }` approves them as the page showed them
 * and answers `{ approved, changed, refused, pending }`: an item that changed since stays pending, and several at
 * once only adopts committed content. Approving answers this machine only (thisMachineRoutes.ts) and is journaled.
 */
export async function handleTrust(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/trust' && req.method === 'GET') {
    const items = withCommitted(ctx.root, pendingTrust(ctx.root, await snapsOf(ctx)));
    // `firstRun`: whether committed items may be adopted together (approveTrust.ts)
    sendJson(res, 200, { items, firstRun: firstRun(ctx.root) });
    return true;
  }
  if (url.pathname !== '/trust/approve' || req.method !== 'POST') return false;
  const b = await readJson<{ items?: unknown }>(req, '{}');
  if (!Array.isArray(b.items) || !b.items.every(isWant)) throw new BadRequest('"items" must list { key, hash }');
  const snaps = await snapsOf(ctx);
  sendJson(res, 200, approveTrust({ root: ctx.root, items: b.items, by: 'trail lead', snaps }));
  return true;
}
