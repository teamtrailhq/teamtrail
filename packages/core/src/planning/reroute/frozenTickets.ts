import type { RerouteProposal } from '../../model/reroute';

/**
 * Tickets a pending proposal would cancel, revise or rewire, mapped to the proposal's id. They can't be claimed until
 * the trail lead decides, so nobody works on something that may be about to change. A `wide` proposal (most of the
 * trail's open work) freezes nothing: one proposal must not stop the trail; the trail lead is asked instead.
 */
export function frozenTickets(proposals: Pick<RerouteProposal, 'id' | 'status' | 'changes' | 'wide'>[]): Map<string, string> {
  const frozen = new Map<string, string>();
  for (const p of proposals.filter((x) => x.status === 'pending' && !x.wide)) {
    for (const c of p.changes) {
      const touches = c.op === 'cancel_ticket' || c.op === 'edit_ticket' || c.op === 'rewire';
      if (touches && !frozen.has(c.ticket)) frozen.set(c.ticket, p.id);
    }
  }
  return frozen;
}
