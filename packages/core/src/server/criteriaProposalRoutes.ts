import type { IncomingMessage, ServerResponse } from 'node:http';
import { dropCriteriaProposal, readCriteriaProposals } from '../criteria/criteriaProposals';
import { writeTicketCriteria } from '../criteria/criteriaStore';
import { contentHash } from '../lib/contentHash';
import { BadRequest, readJson, sendJson } from './http';
import { matchesShown } from './shownContent';

const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 300;

/**
 * `/criteria-proposals`: changes agents proposed to criteria the trail lead confirmed; false when none matches.
 * GET `?mapId=` lists them. POST `/criteria-proposals/accept` (`mapId`, `title`, `ticketId`, `hash` of the proposal
 * shown) is the trail lead taking one (409 when it changed since): its criteria replace the ticket's and are confirmed. POST `/criteria-proposals/dismiss` drops it,
 * and the confirmed criteria stay as they are.
 */
export async function handleCriteriaProposals(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!url.pathname.startsWith('/criteria-proposals')) return false;
  if (url.pathname === '/criteria-proposals' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (!text(mapId)) throw new BadRequest('"mapId" is required');
    const proposals = readCriteriaProposals(root, mapId).map((p) => ({ ...p, hash: contentHash(p.criteria) }));
    sendJson(res, 200, { proposals });
    return true;
  }
  const action = url.pathname.slice('/criteria-proposals/'.length);
  if (req.method !== 'POST' || (action !== 'accept' && action !== 'dismiss')) return false;
  const b = await readJson<Record<string, unknown>>(req, '{}');
  if (!text(b.mapId) || !text(b.ticketId)) throw new BadRequest('"mapId" and "ticketId" are required');
  const waiting = readCriteriaProposals(root, b.mapId).find((p) => p.ticketId === b.ticketId);
  if (!waiting) return (sendJson(res, 404, { error: 'no proposed criteria for this ticket' }), true);
  if (action === 'accept' && !matchesShown(res, { given: b.hash, now: waiting.criteria, what: 'The proposal' }))
    return true;
  const taken = dropCriteriaProposal(root, b.mapId, b.ticketId)!;
  if (action === 'dismiss') return (sendJson(res, 200, { dismissed: taken.ticketKey }), true);
  const map = { id: b.mapId, title: text(b.title) ? b.title : b.mapId };
  const ticket = { id: taken.ticketId, key: taken.ticketKey };
  writeTicketCriteria(root, map, ticket, { criteria: taken.criteria });
  sendJson(res, 200, { ticket: writeTicketCriteria(root, map, ticket, { confirmed: true }) });
  return true;
}
