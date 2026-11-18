import type { ChecksSummary, PullRequestSnapshot } from '../../model/prEvidence';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/** What stands between the open PR and a merge, first that applies; "ready to merge" only when nothing does. */
function mergeTitle(pr: PullRequestSnapshot, checks?: ChecksSummary): string {
  const n = `PR #${pr.number}`;
  if (pr.draft) return `${n} is still a draft`;
  if (pr.mergeable === 'conflicting') return `${n} has merge conflicts`;
  if (pr.review === 'changes_requested') return `${n}: changes requested`;
  if (checks === 'failing') return `${n}: checks failing`;
  if (checks === 'pending') return `${n}: checks still running`;
  return `${n} ready to merge`;
}

/**
 * Done tickets whose pull request is still open: the work is approved and only the merge is left, which is the
 * human's. The title says what stands in the way (a draft, conflicts, changes requested, failing or running checks),
 * and "ready to merge" only when nothing does. One item per ticket, until the pull request is merged or closed (the
 * PR sync's snapshot says so), in place of the PR / CI flag that said the same thing.
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
          title: clip(`${s.ticketKey}: ${mergeTitle(pr, s.checksSummary)}`),
          since: flagged?.since ?? now,
          urgency: 'soon',
          ref: `${s.ticketId}/merge`,
          holds: [],
        },
      ];
    });
  },
};
