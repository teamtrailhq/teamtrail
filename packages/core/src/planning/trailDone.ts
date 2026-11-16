import type { TrailDone, TrailDoneInput } from '../model/trailDone';

const tickets = (n: number) => (n === 1 ? '1 ticket' : `${n} tickets`);

/**
 * Whether a trail is done, decided once and the same way everywhere. Pure: the same tickets, proofs and reroutes
 * always give the same answer and reason.
 *
 * Done means every ticket that isn't ruled out (closed as not planned) is closed as completed, which leaves nothing
 * open, working or waiting for review, and no reroute is pending. A done trail is `verified` only when every done
 * ticket's proof is; otherwise it's `unverified`, done on someone's word for those tickets, and says how many.
 * Pull requests still open don't hold it back: they are what's left to merge once the trail is done.
 */
export function trailDone(input: TrailDoneInput): TrailDone {
  const inScope = input.tickets.filter((t) => !(t.state === 'closed' && t.closeReason === 'not_planned'));
  const open = inScope.filter((t) => t.state === 'open').length;
  if (open) return { kind: 'not-done', reason: `${tickets(open)} still open` };
  if (!inScope.length) return { kind: 'not-done', reason: 'No tickets in scope' };
  if (input.pendingReroutes) return { kind: 'not-done', reason: 'A reroute waits for your review' };
  const done = inScope.length;
  const unverified = inScope.filter((t) => input.proofs[t.id] !== 'verified').map((t) => t.id);
  if (!unverified.length) return { kind: 'verified', done, reason: `All ${tickets(done)} done and verified` };
  const how = unverified.length === done ? 'none verified' : `${unverified.length} not verified`;
  return { kind: 'unverified', done, unverified, reason: `${tickets(done)} done · ${how}` };
}
