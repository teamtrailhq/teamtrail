import { IMPLEMENTATION_TYPES, type Proof, type Ticket } from '@teamtrail/core';

/**
 * Whether a ticket has work its proof speaks for: a completion was submitted, or it is a done implementation ticket
 * (where none being submitted is the point). A research ticket or a junction closed by a decision has none, so it
 * shows no proof, no "not verified" and nothing to merge.
 */
export function workToProve(ticket: Pick<Ticket, 'state' | 'closeReason' | 'type'>, proof: Proof) {
  const done = ticket.state === 'closed' && ticket.closeReason === 'completed';
  return !!proof.attempt.id || (done && IMPLEMENTATION_TYPES.includes(ticket.type));
}
