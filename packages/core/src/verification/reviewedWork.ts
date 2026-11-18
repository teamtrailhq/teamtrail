import type { Ticket } from '../model/types';
import { authorModelOf } from './authorModel';
import { readAttempts, readVerdicts } from './evidenceStore';

/**
 * The work a review ticket asks about: the model its author ran on, and whether a PASS on that same model was already
 * held by the `independent-review` gate (so the review now waits for an agent on another model).
 */
export function reviewedWork(
  root: string,
  mapId: string,
  review: Pick<Ticket, 'reviewOf'>,
): { ticketId?: string; authorModel?: string; held: boolean } {
  if (!review.reviewOf) return { held: false };
  const last = readAttempts(root, mapId, review.reviewOf).at(-1);
  if (!last) return { ticketId: review.reviewOf, held: false };
  const held = readVerdicts(root, mapId, review.reviewOf).some(
    (v) => v.attemptId === last.id && v.sameModel === 'held',
  );
  return { ticketId: review.reviewOf, authorModel: authorModelOf(root, last), held };
}
