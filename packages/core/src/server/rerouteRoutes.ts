import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import type { RerouteProposal } from '../model/reroute';
import { confirmAssumption } from '../planning/assumptions/confirmAssumption';
import { OperationError } from '../planning/operations/operationError';
import { approveReroute, rejectReroute } from '../planning/reroute/decideReroute';
import { rerouteHash } from '../planning/reroute/rerouteApproval';
import { rerouteView, RerouteInvalid, type RerouteEnv } from '../planning/reroute/rerouteFlow';
import { listAllReroutes, listReroutes, readReroute } from '../planning/reroute/rerouteStore';
import { TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

const DECISIONS: Record<string, typeof approveReroute | undefined> = {
  '/reroutes/approve': approveReroute,
  '/reroutes/reject': rejectReroute,
};

const text = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;

/**
 * `/reroutes` and `/assumptions` routes; false when none matches.
 * GET `/reroutes?map=` lists proposals (pending first, with their diff and frozen tickets; decided ones without),
 * GET `/reroutes/<id>?map=` reads one; POST `/reroutes/approve` (`mapId`, `id`, `hash` of the proposal as the page
 * showed it, `note`, `by`) and `/reroutes/reject` (`mapId`, `id`, `note`, `by`) are the trail lead's calls, journaled and applied through the existing operations. GET `/assumptions?map=`, and
 * POST `/assumptions/confirm` (`mapId`, `id`), the trail lead confirming one holds.
 */
export async function handleReroutes(ctx: RouteContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  const { pathname } = url;
  if (pathname === '/assumptions' && req.method === 'GET') {
    const snap = await (await ctx.active()).loadMap(requiredMap(url));
    sendJson(res, 200, { assumptions: snap.map.sections.assumptions ?? [] });
    return true;
  }
  if (pathname === '/assumptions/confirm' && req.method === 'POST') return (await confirm(ctx, req, res), true);
  if (!pathname.startsWith('/reroutes')) return false;
  if (req.method === 'GET') return (await getReroutes(ctx, res, url), true);
  if (req.method !== 'POST') return false;
  const decide = DECISIONS[pathname];
  if (!decide) return false;
  const b = await readJson<{ mapId?: unknown; id?: unknown; note?: unknown; by?: unknown; hash?: unknown }>(req, '{}');
  if (!text(b.mapId) || !text(b.id)) throw new BadRequest('"mapId" and "id" are required');
  // Approving is of what the page showed: its content hash comes with the request (finishing an interrupted apply
  // needs none, it runs what this machine already approved).
  const resumes = readReroute(ctx.root, b.mapId as string, b.id as string)?.status === 'approved';
  if (decide === approveReroute && !resumes && !text(b.hash))
    throw new BadRequest('"hash" is required: the hash of the proposal you reviewed');
  const env: RerouteEnv = { root: ctx.root, adapter: await ctx.active(), journal: journalFile(ctx.root) };
  const decision = {
    mapId: b.mapId as string,
    id: b.id as string,
    // The Lookout's trail lead: this route says so, whatever the body says.
    by: TRAIL_LEAD,
    note: typeof b.note === 'string' ? b.note.slice(0, 2000) : undefined,
    ...(text(b.hash) ? { hash: b.hash as string } : {}),
  };
  try {
    sendJson(res, 200, { reroute: await decide(env, decision) });
  } catch (e) {
    sendDecisionError(res, e);
  }
  return true;
}

async function getReroutes(ctx: RouteContext, res: ServerResponse, url: URL) {
  const map = url.searchParams.get('map');
  const id = url.pathname.slice('/reroutes/'.length);
  if (id) {
    const p = readReroute(ctx.root, requiredMap(url), decodeURIComponent(id));
    if (!p) return sendJson(res, 404, { error: 'no such proposal' });
    return sendJson(res, 200, { reroute: await withView(ctx, p) });
  }
  const all = map ? listReroutes(ctx.root, map) : listAllReroutes(ctx.root);
  const ordered = [
    ...all.filter((p) => p.status === 'pending'),
    ...all.filter((p) => p.status !== 'pending').reverse(),
  ];
  const reroutes = await Promise.all(ordered.map((p) => (p.status === 'pending' ? withView(ctx, p) : p)));
  sendJson(res, 200, { reroutes, pending: reroutes.filter((p) => p.status === 'pending').length });
}

/** POST `/assumptions/confirm` (`mapId`, `id`, `text` as shown): the trail lead confirms an assumption holds. */
async function confirm(ctx: RouteContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ mapId?: unknown; id?: unknown; text?: unknown }>(req, '{}');
  if (!text(b.mapId) || !text(b.id)) throw new BadRequest('"mapId" and "id" are required');
  if (typeof b.text !== 'string') throw new BadRequest('"text": the assumption as you were shown it, is required');
  try {
    const input = { mapId: b.mapId as string, id: b.id as string, by: 'trail lead', shown: b.text };
    sendJson(res, 200, { assumption: await confirmAssumption(await ctx.active(), input) });
  } catch (e) {
    sendDecisionError(res, e);
  }
}

/** A proposal with its dry-run diff and the tickets it freezes. */
async function withView(ctx: RouteContext, p: RerouteProposal) {
  const snap = await (await ctx.active()).loadMap(p.mapId);
  return { ...p, ...rerouteView(ctx.root, snap, p), hash: rerouteHash(p) };
}

function requiredMap(url: URL) {
  const map = url.searchParams.get('map');
  if (!text(map)) throw new BadRequest('"map" is required');
  return map!;
}

function sendDecisionError(res: ServerResponse, e: unknown) {
  if (e instanceof RerouteInvalid) return sendJson(res, 409, { error: e.message, errors: e.errors });
  if (e instanceof OperationError) return sendJson(res, 409, { error: e.message });
  throw e;
}
