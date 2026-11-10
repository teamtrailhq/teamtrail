import { OperationError, type Ticket } from '@teamtrail/core';

/** Refuses a close (or a rule-out) of a ticket that is closed, a review, someone else's claim, or being verified. */
export function assertCloseable(t: Ticket, agent: string) {
  if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
  if (t.type === 'review') throw new OperationError(`${t.key} is a review: answer it with submit_review`);
  if (t.assignee && t.assignee !== agent) throw new OperationError(`${t.key} is claimed by ${t.assignee}`);
  if (t.status === 'verifying')
    throw new OperationError(`${t.key} is being verified: call verification_status ${t.key} for the result`);
}
