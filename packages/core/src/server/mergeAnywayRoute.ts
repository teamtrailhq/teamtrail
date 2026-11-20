import type { IncomingMessage, ServerResponse } from 'node:http';
import { OperationError } from '../planning/operations/operationError';
import { mergeAnyway } from '../proof/mergeAnyway';
import { BadRequest, readJson, sendJson } from './http';
import { lookoutVia } from './lookoutVia';
import { personOfRequest } from './requestPerson';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';

const str = (v: unknown, max = 200) => (typeof v === 'string' && v && v.length <= max ? v : undefined);
const MAX_GAPS = 30;
/** A git commit id: SHA-1, or SHA-256. */
const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

function headOf(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !SHA.test(v)) throw new BadRequest('"head" must be the commit you were shown');
  return v;
}

function gapsOf(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length || v.length > MAX_GAPS || v.some((g) => !str(g, 1000)))
    throw new BadRequest('"gaps" must be the proof\'s gaps as you were shown them');
  return v as string[];
}

/**
 * `POST /proof/merge-anyway` `{mapId, ticketId, gaps, head?}` → `{acceptance, gapsHash, decisionId, head, atPrHead?}`:
 * the trail lead's Merge anyway on a done ticket whose proof isn't verified (proof/mergeAnyway.ts), before a server
 * that merges pull requests (`managed.merge`) is asked to. `head` is the pull request's head the page showed, what is
 * accepted when the proof names no commit; one PR sync has moved past is a 409 that says so. Never cross-site. How the human gave it is this route's (lookoutVia.ts),
 * who did it the sign-in's person (requestPerson.ts): never the body's. A refusal is a 409 with the reason.
 */
export async function handleMergeAnyway(
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (req.method !== 'POST' || url.pathname !== '/proof/merge-anyway') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const b = await readJson<Record<string, unknown>>(req, '{}');
  const mapId = str(b.mapId);
  const ticketId = str(b.ticketId);
  if (!mapId || !ticketId) throw new BadRequest('"mapId" and "ticketId" are required');
  const env = { adapter: await ctx.active(), root: ctx.root };
  const who = { person: personOfRequest(req)?.name, via: lookoutVia(req) };
  try {
    const asked = { mapId, ticketId, gaps: gapsOf(b.gaps), head: headOf(b.head), ...who };
    sendJson(res, 200, await mergeAnyway(env, asked));
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, 409, { error: e.message });
  }
  return true;
}
