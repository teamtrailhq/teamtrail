import type { MapSnapshot, RerouteProposal, Ticket } from '@teamtrail/core';

/** The existing tickets a proposal changes. */
const touched = (p: Pick<RerouteProposal, 'changes'>) => p.changes.flatMap((c) => ('ticket' in c ? [c.ticket] : []));

/**
 * The tickets a proposal changes that moved on after it was made: claimed, closed or edited. Approving applies it to
 * the trail as it is now (a wide proposal froze nothing), so the trail lead sees these before approving.
 */
export function changedSinceProposed(snap: MapSnapshot, p: Pick<RerouteProposal, 'at' | 'changes'>) {
  const ids = new Set(touched(p));
  return snap.tickets
    .filter((t) => ids.has(t.id) && t.updatedAt > p.at)
    .map((t) => ({ key: t.key, title: t.title, what: whatHappened(t) }));
}

function whatHappened(t: Ticket) {
  if (t.state === 'closed') return 'closed';
  if (t.assignee) return `claimed by ${t.assignee}`;
  return 'changed';
}
