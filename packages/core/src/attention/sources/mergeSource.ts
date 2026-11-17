import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/**
 * Done tickets whose pull request is still open: the work is approved and only the merge is left, which is the
 * human's. One item per ticket, until the pull request is merged or closed (the PR sync's snapshot says so), in place
 * of the PR / CI flag that said the same thing.
 */
export const mergeSource: AttentionSource = {
  kind: 'merge',
  collect({ snaps, syncs, now }) {
    const done = new Set(
      snaps.flatMap((s) =>
        s.tickets
          .filter((t) => t.state === 'closed' && t.closeReason === 'completed')
          .map((t) => `${s.map.id}/${t.id}`),
      ),
    );
    return syncs.flatMap((s): Candidate[] => {
      const pr = s.pr;
      if (pr?.state !== 'open' || !done.has(`${s.mapId}/${s.ticketId}`)) return [];
      const flagged = s.flags.find((f) => f.kind === 'done-pr-open');
      return [
        {
          kind: 'merge',
          mapId: s.mapId,
          ticketId: s.ticketId,
          title: clip(`${s.ticketKey}: PR #${pr.number} ready to merge`),
          since: flagged?.since ?? now,
          urgency: 'soon',
          ref: `${s.ticketId}/merge`,
          holds: [],
        },
      ];
    });
  },
};
