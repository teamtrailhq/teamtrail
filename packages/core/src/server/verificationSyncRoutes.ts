import type { IncomingMessage, ServerResponse } from 'node:http';
import { linkPrByHand } from '../evidence/linkPrByHand';
import { prChoices } from '../evidence/prChoices';
import { readTicketSyncs } from '../evidence/syncStore';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';
import type { CiAccess, VerificationWatch } from './watchVerification';

type SyncContext = RouteContext & { watch: VerificationWatch; access: CiAccess };

/**
 * PR and CI evidence the reconciler keeps (watchVerification.ts), and the trail lead's hand links:
 *   GET /verification/sync[?mapId=]   `{ status: PrSyncStatus, tickets: TicketSync[] }`
 *   GET /verification/sync/candidates?mapId=&ticketId=   `{ repo, prs: PrChoice[] }`: the PRs a ticket can be
 *                                     linked to (evidence/prChoices.ts), read with this machine's token
 *   PUT /verification/sync/link       body `{ mapId, ticketId, pr: number | null }`: link a PR to a ticket by hand
 *                                     (checked with the host first, `{ ticket: TicketSync }`), or unlink the one it
 *                                     has (`{ ticket: null }`); evidence/linkPrByHand.ts. A hand link stays put; an
 *                                     unlinked PR is linked again only by hand. Journaled; the reconciler runs next.
 * The last two answer this machine only (thisMachineRoutes.ts): they use its GitHub token, and a link decides which
 * pull request its proof is posted to.
 */
export async function handleVerificationSync(
  ctx: SyncContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const { root, watch } = ctx;
  if (url.pathname === '/verification/sync' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId') ?? undefined;
    sendJson(res, 200, { status: watch.status(), tickets: readTicketSyncs(root, mapId) });
    return true;
  }
  if (url.pathname === '/verification/sync/candidates' && req.method === 'GET') return candidates(ctx, res, url);
  if (url.pathname !== '/verification/sync/link') return false;
  if (req.method !== 'PUT') return (sendJson(res, 405, { error: 'method not allowed' }), true);
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  return link(ctx, req, res);
}

async function candidates(ctx: SyncContext, res: ServerResponse, url: URL) {
  const mapId = url.searchParams.get('mapId');
  const ticketId = url.searchParams.get('ticketId');
  if (!mapId || !ticketId) throw new BadRequest('"mapId" and "ticketId" are required');
  const provider = await ctx.access();
  if (typeof provider === 'string')
    return (sendJson(res, 409, { error: `PR sync can't read pull requests: ${provider}` }), true);
  const prs = await prChoices({ root: ctx.root, mapId, ticketId, provider });
  sendJson(res, 200, { repo: provider.repo, prs });
  return true;
}

async function link(ctx: SyncContext, req: IncomingMessage, res: ServerResponse) {
  const b = await readJson<{ mapId?: unknown; ticketId?: unknown; pr?: unknown }>(req, '{}');
  if (typeof b.mapId !== 'string' || typeof b.ticketId !== 'string')
    throw new BadRequest('"mapId" and "ticketId" are required');
  if (b.pr !== null && !isPrNumber(b.pr)) throw new BadRequest('"pr" must be a pull request number, or null to unlink');
  const { mapId, ticketId, pr } = b;
  const ticket = (await (await ctx.active()).loadMap(mapId)).tickets.find((x) => x.id === ticketId);
  if (!ticket) return (sendJson(res, 404, { error: 'no such ticket' }), true);
  const provider = pr === null ? 'not needed to unlink' : await ctx.access();
  const r = await linkPrByHand({ root: ctx.root, mapId, ticket, pr, provider });
  if (r.kind === 'refused') return (sendJson(res, r.status, { error: r.error }), true);
  ctx.watch.kick();
  sendJson(res, 200, { ticket: r.kind === 'linked' ? r.sync : null });
  return true;
}

const isPrNumber = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2 ** 31;
