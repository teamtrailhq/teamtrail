import { deriveStates, trailDone, type MapSnapshot, type TicketType } from '@teamtrail/core';

const NOT_JUDGED = { kind: 'pending' as const, reason: 'not asked here' };

/**
 * Why next_ticket found nothing: the trail is decided, its plan isn't charted yet, discovery holds implementation
 * back, or what's in the way. Whether every ticket closed means done is core's `trailDone`, as the Lookout judges it.
 */
export function noTicketReason(
  snap: MapSnapshot,
  discovery: { gate?: TicketType[]; next?: string; skipped?: boolean },
): string {
  const open = snap.tickets.filter((x) => x.state === 'open');
  if (!open.length) return closedReason(snap, discovery.skipped);
  if (discovery.gate)
    return `No ready ${discovery.gate.join(', ')} ticket, and implementation tickets wait for the discovery brief: ${discovery.next}`;
  const states = deriveStates(snap.tickets, snap.map.mode);
  const count = (state: string) => open.filter((x) => states.get(x.id) === state).length;
  const waiting = [
    { label: 'verifying', n: count('verifying') },
    { label: 'waiting on the human', n: count('held') },
  ]
    .filter((w) => w.n > 0)
    .map((w) => `, ${w.n} ${w.label}`)
    .join('');
  return `No ready ticket: ${count('claimed')} claimed, ${count('blocked')} blocked, ${count('parked')} parked${waiting}.`;
}

/** Every ticket is closed: decided, unless only discovery was done and the plan is still to be charted. */
function closedReason(snap: MapSnapshot, skipped?: boolean): string {
  const judged = trailDone({
    tickets: snap.tickets,
    proofs: {},
    pendingReroutes: 0,
    together: NOT_JUDGED,
    discoverySkipped: skipped,
  });
  if (judged.kind === 'not-done') return `Every ticket is closed, but the trail isn't done: ${judged.reason}.`;
  return 'Every ticket is closed: the trail is decided.';
}
