import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  confirmCriteriaHere,
  criteriaContent,
  readCriteria,
  readCriteriaFile,
  writeTicketCriteria,
} from '../criteria/criteriaStore';
import { contentHash, trustKey, trustLedger } from '../trust/trustLedger';
import { BadRequest, readJson, sendJson } from './http';
import { checkShown } from './shownHash';

const text = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 300;

/**
 * `/criteria` routes over the acceptance criteria under `root`; false when none matches.
 * GET `?mapId=` lists every ticket's criteria; POST `/criteria/confirm` (`mapId`, `title`, `ticketId`, `ticketKey`,
 * `confirmed`, and `hash`: the criteria as the page showed them) is the trail lead confirming a ticket's criteria (or
 * taking that back, which needs no hash).
 */
export async function handleCriteria(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!url.pathname.startsWith('/criteria')) return false;
  if (url.pathname === '/criteria' && req.method === 'GET') {
    const mapId = url.searchParams.get('mapId');
    if (!text(mapId)) throw new BadRequest('"mapId" is required');
    // each ticket with the hash of its criteria as the page shows them: confirming sends it back (shownHash.ts)
    const hashes = new Map(readCriteriaFile(root, mapId!).map((t) => [t.ticketId, contentHash(criteriaContent(t))]));
    const tickets = readCriteria(root, mapId!).map((t) => ({ ...t, hash: hashes.get(t.ticketId) }));
    sendJson(res, 200, { tickets });
    return true;
  }
  if (url.pathname === '/criteria/confirm' && req.method === 'POST') {
    const b = await readJson<Record<string, unknown>>(req, '{}');
    if (![b.mapId, b.ticketId, b.ticketKey].every(text))
      throw new BadRequest('"mapId", "ticketId" and "ticketKey" are required');
    const current = readCriteria(root, b.mapId as string).find((t) => t.ticketId === b.ticketId);
    if (!current?.criteria.length)
      return (sendJson(res, 404, { error: 'this ticket has no acceptance criteria' }), true);
    const confirming = b.confirmed !== false;
    const onDisk = readCriteriaFile(root, b.mapId as string).find((t) => t.ticketId === b.ticketId);
    const content = onDisk && criteriaContent(onDisk);
    const shown = confirming ? checkShown(b.hash, content, 'These criteria') : ({ ok: true } as const);
    if (!shown.ok) return (sendJson(res, shown.status, { error: shown.error }), true);
    const saved = writeTicketCriteria(
      root,
      { id: b.mapId as string, title: text(b.title) ? (b.title as string) : (b.mapId as string) },
      { id: b.ticketId as string, key: b.ticketKey as string },
      { confirmed: confirming },
    );
    // The confirmation that counts is this machine's record of these exact criteria, not the flag in the file.
    const key = trustKey.criteria(b.mapId as string, b.ticketId as string);
    const at = { mapId: b.mapId as string, ticketId: b.ticketId as string, content: content! };
    if (saved.confirmed) confirmCriteriaHere(root, at, 'trail lead');
    else trustLedger(root).drop(key);
    sendJson(res, 200, { ticket: saved });
    return true;
  }
  return false;
}
