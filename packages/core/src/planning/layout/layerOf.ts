import type { Ticket } from '../../model/types';

/** Each ticket's layer: the length of its longest blocking chain (a cycle counts as no blocker). */
export function layerOf(tickets: Ticket[]) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const d = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const blockers = byId.get(id)?.blockedBy.filter((b) => byId.has(b)) ?? [];
    const v = blockers.length ? 1 + Math.max(...blockers.map(d)) : 0;
    visiting.delete(id);
    depth.set(id, v);
    return v;
  };
  return d;
}
