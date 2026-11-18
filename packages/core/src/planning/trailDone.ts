import type { TrailTogether } from '../model/trailChecks';
import type { TrailDone, TrailDoneInput } from '../model/trailDone';

const tickets = (n: number) => (n === 1 ? '1 ticket' : `${n} tickets`);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The combined run in words, after the tickets' count. */
function togetherText(t: TrailTogether): string {
  if (t.kind === 'passed') return `verified together on ${t.branch ?? 'main'} at ${t.commit.slice(0, 7)}`;
  return lower(t.reason);
}

/**
 * Whether a trail is done, decided once and the same way everywhere. Pure: the same tickets, proofs, reroutes and
 * combined run always give the same answer and reason.
 *
 * Done means every ticket that isn't ruled out (closed as not planned) is closed as completed, which leaves nothing
 * open, working or waiting for review, and no reroute is pending. A done trail is `verified` only when every done
 * ticket's proof is and the approved checks passed together on the default branch at a commit holding all of their
 * merges; otherwise it's `unverified` and says why. Each ticket passing alone is not enough.
 */
export function trailDone(input: TrailDoneInput): TrailDone {
  const inScope = input.tickets.filter((t) => !(t.state === 'closed' && t.closeReason === 'not_planned'));
  const open = inScope.filter((t) => t.state === 'open').length;
  if (open) return { kind: 'not-done', reason: `${tickets(open)} still open` };
  if (!inScope.length) return { kind: 'not-done', reason: 'No tickets in scope' };
  if (input.pendingReroutes) return { kind: 'not-done', reason: 'A reroute waits for your review' };
  const done = inScope.length;
  const { together } = input;
  const unverified = inScope.filter((t) => input.proofs[t.id] !== 'verified').map((t) => t.id);
  if (!unverified.length && together.kind === 'passed')
    return { kind: 'verified', done, together, reason: `All ${tickets(done)} verified · ${togetherText(together)}` };
  const how = unverified.length === done ? 'none verified' : `${unverified.length} not verified`;
  const parts = [`${tickets(done)} done`, ...(unverified.length ? [how] : []), togetherText(together)];
  return { kind: 'unverified', done, unverified, together, reason: parts.join(' · ') };
}
