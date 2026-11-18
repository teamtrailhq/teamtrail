import { OperationError, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { criteriaHeld } from '@teamtrail/core/agents';

const WAITS =
  'its acceptance criteria wait for the human to confirm them in the Lookout: criteria are what done means, so they agree before the work starts';

/** Ready tickets whose criteria wait for the trail lead's confirmation: no agent is offered them until then. */
export const criteriaGate = (root: string, snap: MapSnapshot): Ticket[] => {
  const held = new Set(
    criteriaHeld(root, snap)
      .filter((w) => w.stage === 'before-work')
      .map((w) => w.ticket.id),
  );
  return snap.tickets.filter((t) => held.has(t.id));
};

/** Refuses claiming a ticket whose criteria wait for the human. */
export function assertCriteriaConfirmed(held: Ticket[], t: Ticket) {
  if (held.some((h) => h.id === t.id)) throw new OperationError(`${t.key} can't be claimed yet: ${WAITS}.`);
}

/** Why next_ticket offered nothing when only tickets waiting on their criteria are ready. */
export const criteriaReason = (held: Ticket[]) =>
  `No ready ticket: ${held.map((t) => t.key).join(', ')} ${held.length === 1 ? 'waits' : 'wait'} for the human to confirm ${held.length === 1 ? 'its' : 'their'} acceptance criteria in the Lookout. Do other work meanwhile, or tell the human.`;
