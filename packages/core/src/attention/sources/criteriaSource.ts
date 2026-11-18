import type { CriteriaWaiting } from '../../criteria/criteriaHeld';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/** Why the criteria wait, in the item's words. */
function note(w: CriteriaWaiting): string {
  if (w.stage === 'after-pass') return `${w.attemptId} passed against them: confirming checks it again by itself`;
  const n = w.count === 1 ? '1 criterion' : `${w.count} criteria`;
  return `${n}: no agent starts it until you confirm them`;
}

/**
 * Tickets whose criteria wait for the trail lead (criteria/criteriaHeld.ts): before any agent may start one, or a
 * pass that waits for them instead of closing.
 */
export const criteriaSource: AttentionSource = {
  kind: 'criteria',
  collect({ criteria }) {
    return (criteria ?? []).map((w): Candidate => ({
      kind: 'criteria',
      mapId: w.mapId,
      ticketId: w.ticket.id,
      title: clip(`Confirm the criteria of ${w.ticket.key} ${w.ticket.title}`),
      since: w.since,
      urgency: 'soon',
      ref: w.ticket.id,
      holds: [w.ticket.id],
      notes: [note(w)],
    }));
  },
};
