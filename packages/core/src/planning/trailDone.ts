import { DISCOVERY_TYPES } from '../discovery/brief';
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
 * open, working or waiting for review, and no reroute is pending. Unless the trail lead skipped discovery, a trail
 * whose tickets in scope are all discovery tickets (the research behind the brief) isn't done: its plan isn't charted
 * yet, and the implementation tickets are still to come. A done trail is `verified` only when every done
 * ticket's proof is and the approved checks passed together on the default branch at a commit holding all of their
 * merges; otherwise it's `unverified` and says why. Each ticket passing alone is not enough.
 * A trail whose done work didn't land (a PR closed without merging, work reverted on the default branch) isn't done:
 * no flag and no Destination reached until it does.
 */
export function trailDone(input: TrailDoneInput): TrailDone {
  const inScope = input.tickets.filter((t) => !(t.state === 'closed' && t.closeReason === 'not_planned'));
  const open = inScope.filter((t) => t.state === 'open').length;
  if (open) return { kind: 'not-done', reason: `${tickets(open)} still open` };
  if (!inScope.length) return { kind: 'not-done', reason: 'No tickets in scope' };
  if (!input.discoverySkipped && inScope.every((t) => t.type && DISCOVERY_TYPES.includes(t.type)))
    return { kind: 'not-done', reason: "The plan isn't charted yet" };
  if (input.pendingReroutes) return { kind: 'not-done', reason: 'A reroute waits for your review' };
  const { together } = input;
  if (together.kind === 'not-landed') return { kind: 'not-done', reason: `The work hasn't landed: ${together.reason}` };
  const done = inScope.length;
  const unverified = inScope.filter((t) => input.proofs[t.id] !== 'verified').map((t) => t.id);
  if (!unverified.length && together.kind === 'passed')
    return { kind: 'verified', done, together, reason: `All ${tickets(done)} verified · ${togetherText(together)}` };
  const how = unverified.length === done ? 'none verified' : `${unverified.length} not verified`;
  const parts = [`${tickets(done)} done`, ...(unverified.length ? [how] : []), togetherText(together)];
  return { kind: 'unverified', done, unverified, together, reason: parts.join(' · ') };
}
