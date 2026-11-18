import { trustKey, trustLedger } from '../trust/trustLedger';
import { confirmCriteriaHere, criteriaContent, readCriteriaFile, writeTicketCriteria } from './criteriaStore';

/** A ticket's criteria as this machine records them when confirmed: what the page's hash must match. */
export function criteriaShownText(root: string, mapId: string, ticketId: string): string | undefined {
  const onDisk = readCriteriaFile(root, mapId).find((t) => t.ticketId === ticketId);
  return onDisk && criteriaContent(onDisk);
}

/**
 * The trail lead confirms a ticket's criteria (or takes that back). The confirmation that counts is this machine's
 * record of exactly `content`, the criteria as shown (the caller has checked its hash), not the flag in the file.
 */
export function setCriteriaConfirmed(o: {
  root: string;
  map: { id: string; title: string };
  ticket: { id: string; key: string };
  confirmed: boolean;
  content?: string;
}) {
  const saved = writeTicketCriteria(o.root, o.map, o.ticket, { confirmed: o.confirmed });
  const at = { mapId: o.map.id, ticketId: o.ticket.id, content: o.content ?? '' };
  if (saved.confirmed && o.content !== undefined) confirmCriteriaHere(o.root, at, 'trail lead');
  else trustLedger(o.root).drop(trustKey.criteria(o.map.id, o.ticket.id));
  return saved;
}
