import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { OperationError } from '../planning/operations/operationError';
import { undoWaiver } from '../verification/undoWaiver';
import { waiveChecks } from '../verification/waiveChecks';
import { BadRequest, readJson, sendJson } from './http';
import { lookoutVia } from './lookoutVia';
import { personOfRequest } from './requestPerson';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';

const str = (v: unknown, max = 200) => (typeof v === 'string' && v && v.length <= max ? v : undefined);
const MAX_REASON = 2000;

/** The checks a waiver names, each with the hash of what the page showed of it. */
function checksOf(v: unknown): { name: string; hash: string }[] {
  if (!Array.isArray(v) || !v.length || v.length > 20) throw new BadRequest('"checks" must name 1–20 checks');
  return v.map((c: { name?: unknown; hash?: unknown }) => {
    const name = str(c?.name, 60);
    const hash = str(c?.hash, 80);
    if (!name || !hash) throw new BadRequest('each check needs its "name" and the "hash" you were shown');
    return { name, hash };
  });
}

function ids(b: Record<string, unknown>) {
  const mapId = str(b.mapId);
  const ticketId = str(b.ticketId);
  if (!mapId || !ticketId) throw new BadRequest('"mapId" and "ticketId" are required');
  return { mapId, ticketId };
}

function waiveBody(b: Record<string, unknown>) {
  const attemptId = str(b.attemptId, 80);
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (!attemptId) throw new BadRequest('"attemptId" of the completion you were shown is required');
  if (!reason || reason.length > MAX_REASON)
    throw new BadRequest(`"reason" is required, at most ${MAX_REASON} characters`);
  return { ...ids(b), attemptId, reason, checks: checksOf(b.checks) };
}

/**
 * The trail lead's "Accept without <check>" (verification/waiveChecks.ts) and its Undo (undoWaiver.ts):
 *   POST /verification/waive       `{mapId, ticketId, attemptId, checks: [{name, hash}], reason}` → `{waiver, attemptId?}`
 *   POST /verification/waive/undo  `{mapId, ticketId}` → `{undone}`
 * Never cross-site. How the human gave it is this route's (lookoutVia.ts), who did it the sign-in's person
 * (requestPerson.ts), whether it came from this machine the socket's (`local`): never the body's. A refusal is a 409
 * with the reason; checks still waiting for approval are a 409 too.
 */
export async function handleWaivers(
  ctx: RouteContext & { local?: boolean },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const p = url.pathname;
  if (req.method !== 'POST' || (p !== '/verification/waive' && p !== '/verification/waive/undo')) return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const b = await readJson<Record<string, unknown>>(req, '{}');
  const env = { adapter: await ctx.active(), root: ctx.root, journal: journalFile(ctx.root) };
  const who = { person: personOfRequest(req)?.name, via: lookoutVia(req) };
  try {
    const out =
      p === '/verification/waive'
        ? await waiveChecks(env, { ...waiveBody(b), ...who, local: ctx.local !== false })
        : await undoWaiver(env, { ...ids(b), ...who });
    sendJson(res, 200, out);
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, 409, { error: e.message });
  }
  return true;
}
