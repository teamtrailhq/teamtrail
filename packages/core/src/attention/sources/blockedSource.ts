import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/** Tickets held in phase `blocked`: a reviewer asked for the human, or the checks failed or couldn't run. */
export const blockedSource: AttentionSource = {
  kind: 'blocked',
  collect({ approvals }) {
    return approvals
      .filter((a) => a.kind === 'held')
      .map((a): Candidate => ({
        kind: 'blocked',
        mapId: a.mapId,
        ticketId: a.ticketId,
        title: clip(`Decide on held ${a.ticketKey} ${a.title}`),
        since: a.at,
        urgency: 'soon',
        ref: a.ticketId,
        holds: [a.ticketId],
        // the way out when a check can't pass, from the ticket: Accept without <check>
        notes: [
          clip(a.reason, 120),
          ...(a.waivable ? [clip(`you can accept it without ${a.waivable.join(', ')}`, 120)] : []),
        ],
      }));
  },
};
