import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentHash, trustKey, trustLedger } from '../trust/trustLedger';
import { CRITERIA_DIR, type Criterion, type TicketCriteria } from './criteria';
import { parseCriteria, serializeCriteria } from './criteriaFile';

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const file = (root: string, mapId: string) => path.join(root, CRITERIA_DIR, `${safe(mapId)}.md`);

/** Every ticket's criteria exactly as the file has them. */
export function readCriteriaFile(root: string, mapId: string): TicketCriteria[] {
  const f = file(root, mapId);
  if (!existsSync(f)) return [];
  try {
    return parseCriteria(readFileSync(f, 'utf8'));
  } catch {
    return [];
  }
}

/** What a confirmation covers: the ticket and the exact criteria, so editing any of them needs it again. */
export const criteriaContent = (t: TicketCriteria) =>
  [
    `ticket ${t.ticketId}`,
    ...t.criteria.map((c) => `${c.id} [${c.kind}${c.source ? `, ${c.source}` : ''}] ${c.text}`),
  ].join('\n');

/**
 * A trail's criteria as this machine trusts them. "· confirmed" in the file counts only for the criteria the trail
 * lead confirmed here (trust/trustLedger.ts); otherwise `confirmed` is unset and `approval` says why.
 */
export function readCriteria(root: string, mapId: string): TicketCriteria[] {
  const all = readCriteriaFile(root, mapId);
  if (!all.some((t) => t.confirmed)) return all;
  const ledger = trustLedger(root);
  return all.map((t) => {
    if (!t.confirmed) return t;
    const standing = ledger.standing(trustKey.criteria(mapId, t.ticketId), contentHash(criteriaContent(t)));
    if (standing === 'approved') return t;
    const { confirmed: _claimed, ...rest } = t;
    return { ...rest, approval: standing };
  });
}

/** Trail ids that have a criteria file. */
export function criteriaIds(root: string): string[] {
  try {
    return readdirSync(path.join(root, CRITERIA_DIR))
      .filter((n) => n.endsWith('.md'))
      .map((n) => n.slice(0, -3));
  } catch {
    return [];
  }
}

/** The trail lead confirmed a ticket's criteria on this machine, as the file has them now. */
export function confirmCriteriaHere(
  root: string,
  at: { mapId: string; ticketId: string; content: string },
  by: string,
) {
  const { mapId, ticketId, content } = at;
  trustLedger(root).set({
    [trustKey.criteria(mapId, ticketId)]: { hash: contentHash(content), at: Date.now(), by, content },
  });
}

export const criteriaOf = (root: string, mapId: string, ticketId: string): Criterion[] =>
  readCriteria(root, mapId).find((t) => t.ticketId === ticketId)?.criteria ?? [];

/** Replaces one ticket's criteria (unconfirming them), or sets their confirmation. */
export function writeTicketCriteria(
  root: string,
  map: { id: string; title: string },
  ticket: { id: string; key: string },
  patch: { criteria: Criterion[] } | { confirmed: boolean },
) {
  const file_ = readCriteriaFile(root, map.id);
  const all = file_.filter((t) => t.ticketId !== ticket.id);
  const prev = file_.find((t) => t.ticketId === ticket.id);
  const next: TicketCriteria =
    'criteria' in patch
      ? { ticketId: ticket.id, ticketKey: ticket.key, criteria: patch.criteria }
      : {
          ticketId: ticket.id,
          ticketKey: ticket.key,
          criteria: prev?.criteria ?? [],
          confirmed: patch.confirmed || undefined,
        };
  mkdirSync(path.join(root, CRITERIA_DIR), { recursive: true });
  writeFileSync(file(root, map.id), serializeCriteria(map.title, [...all, next]));
  return next;
}
