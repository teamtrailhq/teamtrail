import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CriteriaProposal } from '../criteria/criteria';
import { dropCriteriaProposal, readCriteriaProposals } from '../criteria/criteriaProposals';
import { confirmCriteriaHere, criteriaContent, writeTicketCriteria } from '../criteria/criteriaStore';
import { contentHash } from '../trust/trustLedger';
import { BadRequest, readJson, sendJson } from './http';
import { checkShown } from './shownHash';

const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 300;

/** What accepting a proposal approves: the criteria it proposes, as this machine records confirmed criteria. */
const contentOf = (p: CriteriaProposal) =>
  criteriaContent({ ticketId: p.ticketId, ticketKey: p.ticketKey, criteria: p.criteria });

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
    const proposals = readCriteriaProposals(root, mapId).map((p) => ({ ...p, hash: contentHash(contentOf(p)) }));
    sendJson(res, 200, { proposals });
    return true;
  }
  const action = url.pathname.slice('/criteria-proposals/'.length);
  if (req.method !== 'POST' || (action !== 'accept' && action !== 'dismiss')) return false;
  const b = await readJson<Record<string, unknown>>(req, '{}');
  if (!text(b.mapId) || !text(b.ticketId)) throw new BadRequest('"mapId" and "ticketId" are required');
  const waiting = readCriteriaProposals(root, b.mapId).find((p) => p.ticketId === b.ticketId);
  if (!waiting) return (sendJson(res, 404, { error: 'no proposed criteria for this ticket' }), true);
  const shown = action === 'accept' ? checkShown(b.hash, contentOf(waiting), 'The proposal') : ({ ok: true } as const);
  if (!shown.ok) return (sendJson(res, shown.status, { error: shown.error }), true);
  const taken = dropCriteriaProposal(root, b.mapId, b.ticketId)!;
  if (action === 'dismiss') return (sendJson(res, 200, { dismissed: taken.ticketKey }), true);
  const map = { id: b.mapId, title: text(b.title) ? b.title : b.mapId };
  const ticket = { id: taken.ticketId, key: taken.ticketKey };
  writeTicketCriteria(root, map, ticket, { criteria: taken.criteria });
  const confirmed = writeTicketCriteria(root, map, ticket, { confirmed: true });
  // accepting confirms them: this machine records exactly the criteria shown (the flag in the file alone counts for nothing)
  confirmCriteriaHere(root, { mapId: b.mapId, ticketId: taken.ticketId, content: contentOf(taken) }, 'trail lead');
  sendJson(res, 200, { ticket: confirmed });
  return true;
}
