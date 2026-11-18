import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import { OperationError } from '../planning/operations/operationError';
import { signedTrailProofMarkdown } from '../proof/signedTrailProofMarkdown';
import { trailProofFor } from '../proof/trailProofFor';
import { addFixTicket } from '../trailChecks/addFixTicket';
import { readTrailChecks } from '../trailChecks/readTrailChecks';
import { requestTrailRun, TRAIL_RUN_BY } from '../trailChecks/requestTrailRun';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';

export interface TrailChecksRouteContext extends RouteContext {
  env: MainRunEnv;
  configDir?: string;
  /** Tells open Lookouts to load the trail's checks again. */
  changed: () => void;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * Trail verified together (trailChecks/):
 *   GET  /trail-checks?mapId=        TrailChecksView: the merges, the latest combined run and whether it verifies
 *   GET  /trail-checks/proof?mapId=  `{ proof, markdown, keyFile? }`: the trail's proof, signed like a ticket's
 *   POST /trail-checks/run           `{ mapId }`: Run now (before everything merged) or Run again, journaled → `{ run }`
 *   POST /trail-checks/fix-ticket    `{ mapId, runId }`: a task with the failing checks for agents, this machine only,
 *                                    journaled → `{ ticket: { id, key } }`
 * Runs use only the approved check commands; the bridge's runner runs them when the server has one (Cloud).
 */
export async function handleTrailChecks(
  ctx: TrailChecksRouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith('/trail-checks')) return false;
  if (req.method === 'GET' && (p === '/trail-checks' || p === '/trail-checks/proof')) {
    const mapId = url.searchParams.get('mapId');
    if (!mapId) throw new BadRequest('"mapId" is required');
    const adapter = await ctx.active();
    const snap = await adapter.loadMap(mapId);
    if (p === '/trail-checks') return (sendJson(res, 200, await readTrailChecks(ctx.env, snap)), true);
    const proof = await trailProofFor({ env: ctx.env, snap, decisions: await adapter.listDecisions(mapId) });
    const { markdown, keyFile } = signedTrailProofMarkdown(ctx.root, proof, ctx.configDir);
    return (sendJson(res, 200, { proof, markdown, ...(keyFile ? { keyFile } : {}) }), true);
  }
  if (req.method !== 'POST') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const body = await readJson<Record<string, unknown>>(req, '{}');
  const mapId = str(body.mapId);
  if (!mapId) throw new BadRequest('"mapId" is required');
  const adapter = await ctx.active();
  if (p === '/trail-checks/run') {
    const start = requestTrailRun(ctx.env, await adapter.loadMap(mapId));
    ctx.changed();
    if (start.kind !== 'started') return (sendJson(res, 409, { error: start.reason }), true);
    void start.done.then(ctx.changed, () => undefined);
    return (sendJson(res, 200, { run: start.run }), true);
  }
  if (p === '/trail-checks/fix-ticket') {
    const runId = str(body.runId);
    if (!runId) throw new BadRequest('"runId" is required');
    try {
      const ticket = await addFixTicket({ root: ctx.root, adapter, mapId, runId, by: TRAIL_RUN_BY });
      ctx.changed();
      return (sendJson(res, 200, { ticket: { id: ticket.id, key: ticket.key } }), true);
    } catch (e) {
      if (!(e instanceof OperationError)) throw e;
      return (sendJson(res, 409, { error: e.message }), true);
    }
  }
  return false;
}
