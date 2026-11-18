import type { IncomingMessage, ServerResponse } from 'node:http';
import { approvePlan, type PlanShown } from '../discovery/approvePlan';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const MAX_TICKETS = 200;
const text = (v: unknown, max = 300) => typeof v === 'string' && v.length > 0 && v.length <= max;
/** A trail's id names a file here: a slug, an issue number or a tracker's uuid, nothing else. */
const trailId = (v: unknown) => typeof v === 'string' && /^[\w.-]{1,200}$/.test(v) && !v.includes('..');

/** The request as the plan the page showed; anything malformed is a 400 before a file is read. */
function planOf(b: Record<string, unknown>): PlanShown {
  if (!trailId(b.mapId) || !text(b.brief)) throw new BadRequest('"mapId" and "brief" (the hash shown) are required');
  if (!Array.isArray(b.criteria) || b.criteria.length > MAX_TICKETS)
    throw new BadRequest(`"criteria" must be a list of at most ${MAX_TICKETS} tickets`);
  const criteria = (b.criteria as Record<string, unknown>[]).map((c) => {
    if (![c?.ticketId, c?.ticketKey, c?.hash].every((v) => text(v)))
      throw new BadRequest('each of "criteria" needs "ticketId", "ticketKey" and "hash"');
    return { ticketId: c.ticketId as string, ticketKey: c.ticketKey as string, hash: c.hash as string };
  });
  if (new Set(criteria.map((c) => c.ticketId)).size !== criteria.length)
    throw new BadRequest('each ticket once in "criteria"');
  const title = text(b.title) ? (b.title as string) : (b.mapId as string);
  return { mapId: b.mapId as string, title, brief: b.brief as string, criteria };
}

/**
 * `POST /plan/approve`: the trail lead approves a trail's plan in one step, the brief and every ticket's criteria
 * the page showed, each bound to its hash (discovery/approvePlan.ts). False for any other request.
 */
export async function handlePlan({ root, active }: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname !== '/plan/approve' || req.method !== 'POST') return false;
  const plan = planOf(await readJson<Record<string, unknown>>(req, '{}'));
  const r = await approvePlan({ root, adapter: active, plan });
  sendJson(res, r.status, r.body);
  return true;
}
