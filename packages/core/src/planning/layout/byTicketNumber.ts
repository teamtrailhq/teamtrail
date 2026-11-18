import type { Ticket } from '../../model/types';

const numberOf = (t: Ticket) => Number(/(\d+)\D*$/.exec(t.key)?.[1] ?? NaN);

/** Orders tickets by their number (`#12` before `#103`, `WAY-2` before `WAY-10`), then by key and id. */
export function byTicketNumber(a: Ticket, b: Ticket) {
  const na = numberOf(a);
  const nb = numberOf(b);
  if (na !== nb && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.key.localeCompare(b.key) || a.id.localeCompare(b.id);
}
