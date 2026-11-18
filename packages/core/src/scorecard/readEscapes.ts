import { readTicketSyncs } from '../evidence/syncStore';
import { journalFile } from '../history/journalFile';
import type { Escape, EscapeTicket } from '../model/escape';
import type { MapSnapshot } from '../model/types';
import { readAttempts } from '../verification/evidenceStore';
import { findEscapes } from './findEscapes';
import { readReverts } from './readReverts';

/** The ticket's pull request: the PR sync's link, else the newest attempt that named one. */
function prOf(ticket: Omit<EscapeTicket, 'pr'>, linked: Map<string, number>) {
  return (
    linked.get(`${ticket.mapId}/${ticket.ticketId}`) ??
    [...ticket.attempts].reverse().find((a) => Number.isInteger(a.pr) && a.pr! > 0)?.pr
  );
}

/**
 * Every escape on these trails (findEscapes.ts): their tickets' attempts and journals, the PR sync's links and the
 * reverts on the default branch (at `at`, a commit of it, when given: readReverts.ts). Git is read only when some
 * ticket has a passing attempt.
 */
export async function readEscapes(root: string, snaps: MapSnapshot[], o: { at?: string } = {}): Promise<Escape[]> {
  const journal = journalFile(root);
  const linked = new Map(readTicketSyncs(root).map((s) => [`${s.mapId}/${s.ticketId}`, s.link.number]));
  const tickets = snaps.flatMap((s) =>
    s.tickets
      .filter((t) => t.type !== 'review')
      .map((t) => ({ mapId: s.map.id, ticketId: t.id, ticketKey: t.key, attempts: readAttempts(root, s.map.id, t.id) }))
      .filter((t) => t.attempts.some((a) => a.result === 'pass'))
      .map((t) => ({ ...t, pr: prOf(t, linked) })),
  );
  if (!tickets.length) return [];
  const transitions = snaps.flatMap((s) => journal.read(s.map.id));
  return findEscapes({ tickets, transitions, reverts: await readReverts(root, o) });
}
