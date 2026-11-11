import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MapSnapshot } from '../model/types';
import { outsideChanges } from '../signedState/outsideChanges';
import { revertState } from '../signedState/revertState';
import { stateKeyFile } from '../signedState/stateItems';
import { approveTogether } from '../trust/approveTogether';
import { firstRun, stateFirstRun } from '../trust/firstRun';
import { pendingTrust } from '../trust/pendingTrust';
import { withCommitted } from '../trust/withCommitted';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

type Want = { key: string; hash: string };

/** The routes' context; `changed` tells the open pages a trail file reads differently now (an accepted change). */
type TrustContext = RouteContext & { changed?: (rel: string) => void };
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
 * POST `/trust/revert` `{ key, hash }` writes the signed values back over a trail file changed outside Teamtrail
 * (signedState/revertState.ts), only as shown (409 when it changed since); this machine only, journaled.
 * GET `/signed-state` lists which tickets, decisions and trails changed outside Teamtrail, by field, and which had
 * only their text edited: what the Lookout marks.
 */
export async function handleTrust(ctx: TrustContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === '/trust' && req.method === 'GET') {
    const items = await withCommitted(ctx.root, pendingTrust(ctx.root, await snapsOf(ctx)));
    // `firstRun`, `stateFirstRun`: whether committed items (trail files) may be adopted together (approveTrust.ts)
    sendJson(res, 200, { items, firstRun: firstRun(ctx.root), stateFirstRun: stateFirstRun(ctx.root) });
    return true;
  }
  if (url.pathname === '/trust/revert' && req.method === 'POST') return revert(ctx, req, res);
  if (url.pathname === '/signed-state' && req.method === 'GET') return (sendJson(res, 200, signedState(ctx)), true);
  if (url.pathname !== '/trust/approve' || req.method !== 'POST') return false;
  const b = await readJson<{ items?: unknown }>(req, '{}');
  if (!Array.isArray(b.items) || !b.items.every(isWant)) throw new BadRequest('"items" must list { key, hash }');
  const snaps = await snapsOf(ctx);
  const result = await approveTogether({ root: ctx.root, items: b.items, by: 'trail lead', snaps });
  for (const key of result.approved) {
    const rel = stateKeyFile(key);
    if (rel) ctx.changed?.(rel);
  }
  sendJson(res, 200, result);
  return true;
}

async function revert(ctx: RouteContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ key?: unknown; hash?: unknown }>(req, '{}');
  if (!isWant(b)) throw new BadRequest('"key" and "hash" are required');
  try {
    revertState({ root: ctx.root, key: b.key, hash: b.hash, by: 'trail lead' });
  } catch (e) {
    return (sendJson(res, 409, { error: (e as Error).message }), true);
  }
  sendJson(res, 200, { reverted: b.key });
  return true;
}

/** The outside changes and text edits, by item, without the files' contents. */
function signedState(ctx: RouteContext) {
  const out = outsideChanges(ctx.root);
  const brief = (c: { mapId: string; kind: string; id: string }) => ({ mapId: c.mapId, kind: c.kind, id: c.id });
  return {
    problems: out.problems,
    changes: out.changes.map((c) => ({ ...brief(c), fields: c.fields })),
    textEdits: out.textEdits.map(brief),
  };
}
