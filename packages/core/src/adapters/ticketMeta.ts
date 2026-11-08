import type { TicketMetaPatch } from '../model/lifecycle';
import type { Ticket } from '../model/types';

const FIELDS = ['status', 'verification', 'checks', 'reviewOf', 'guide'] as const;

/** `t` with `patch` applied; `null` clears a field. */
export function withMeta(t: Ticket, patch: TicketMetaPatch): Ticket {
  const next: Record<string, unknown> = { ...t };
  for (const k of FIELDS) {
    if (patch[k] === undefined) continue;
    if (patch[k] === null) delete next[k];
    else next[k] = patch[k];
  }
  return next as unknown as Ticket;
}
