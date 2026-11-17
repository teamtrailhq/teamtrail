import { ago } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';

/** At most this many rows in Up next. */
const MAX = 6;

/**
 * What comes next on the trail: the tickets waiting for an agent to pick them up, longest waiting first, then those
 * that wait on something of yours ("Waits on your #6"). Each with one context line.
 */
export function upNextRows(live: LiveTicket[], now: number): { ticket: LiveTicket['ticket']; context: string }[] {
  const waiting = live
    .filter((l) => l.tone === 'waiting-agent')
    .sort((a, b) => (a.readySince ?? 0) - (b.readySince ?? 0))
    .map((l) => ({
      ticket: l.ticket,
      context: `Waiting for an agent to pick it up · ${ago(Math.max(0, now - (l.readySince ?? now)))}`,
    }));
  const yours = live
    .filter((l) => l.waitsOnYours.length > 0)
    .map((l) => ({ ticket: l.ticket, context: `Waits on your ${l.waitsOnYours.join(', ')}` }));
  return [...waiting, ...yours].slice(0, MAX);
}
