import type { Ticket } from '../../model/types';

/**
 * Each ticket's layer: the length of its longest blocking chain (a cycle counts as no blocker). A review ticket
 * that waits on nothing sits in the layer of the ticket it reviews, beside it, rather than at the start of the trail.
 */
export function layerOf(tickets: Ticket[]) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const v = own(byId.get(id));
    visiting.delete(id);
    depth.set(id, v);
    return v;
  };
  const own = (t: Ticket | undefined) => {
    if (!t) return 0;
    const blockers = t.blockedBy.filter((b) => byId.has(b));
    if (blockers.length) return 1 + Math.max(...blockers.map(d));
    const reviewed = reviewedId(t, byId);
    return reviewed ? d(reviewed) : 0;
  };
  return d;
}

/** The ticket a review ticket reviews, when it is on this map. */
function reviewedId(t: Ticket, byId: Map<string, Ticket>) {
  if (t.type !== 'review' || !t.reviewOf || t.reviewOf === t.id) return undefined;
  return byId.has(t.reviewOf) ? t.reviewOf : undefined;
}
