import { trailChecksItem } from '../../trailChecks/trailChecksItem';
import type { AttentionSource, Candidate } from '../types';

/**
 * Every ticket of a trail is done and merged, each passed alone, but the approved checks fail on the default branch
 * with all of it together. One item per trail and run; it opens the trail's destination, where the human adds a fix
 * ticket for agents to pick up or runs the checks again. Once a fix ticket is added the trail isn't done, so the item
 * goes; the next run on main after its merge decides again.
 */
export const trailChecksSource: AttentionSource = {
  kind: 'trail-checks',
  collect({ trailChecks = [] }) {
    return trailChecks.flatMap((view): Candidate[] => {
      const { state, run } = view;
      if (state.kind !== 'failed' || !run) return [];
      const item = trailChecksItem(run);
      return [
        {
          kind: 'trail-checks',
          mapId: view.mapId,
          title: item.title,
          since: run.finishedAt ?? run.startedAt,
          urgency: 'soon',
          ref: run.id,
          holds: [],
          notes: [
            `${state.failing.join(', ')} ${state.failing.length === 1 ? 'fails' : 'fail'}`,
            ...(run.commit ? [`on ${run.branch ?? 'main'} at ${run.commit.slice(0, 7)}`] : []),
          ],
        },
      ];
    });
  },
};
