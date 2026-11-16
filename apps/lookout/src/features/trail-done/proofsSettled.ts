import type { Ticket } from '@teamtrail/core';
import type { ProofStatuses } from '../map';

/** Every ticket closed as completed has its proof status loaded: right after one closes, the proofs lag a moment. */
export function proofsSettled(tickets: Ticket[], proofs: ProofStatuses) {
  return tickets.every((t) => t.state !== 'closed' || t.closeReason !== 'completed' || proofs[t.id] !== undefined);
}
