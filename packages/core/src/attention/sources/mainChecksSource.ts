import { mainChecksHeld } from '../../mainChecks/mainChecksHeld';
import { mainChecksItem } from '../../mainChecks/mainChecksItem';
import type { AttentionSource, Candidate } from '../types';

/**
 * Checks already fail on main and nobody chose what to do about it: the trail's implementation waits. Blocking, one
 * item per trail; it opens the trail, where the human fixes main first, drops the check for the trail or starts anyway.
 * Once they chose to fix main first, the item goes: the trail step keeps the re-run.
 */
export const mainChecksSource: AttentionSource = {
  kind: 'main-checks',
  collect({ snaps, mainChecks = [] }) {
    return mainChecks.flatMap((view): Candidate[] => {
      const { state, run } = view;
      // only a trail ready for work is asked: one still in discovery starts no implementation yet
      if (state.kind !== 'failed' || state.fixing || !run || !view.holds) return [];
      const snap = snaps.find((s) => s.map.id === view.mapId);
      if (!snap) return [];
      const held = mainChecksHeld(snap, view);
      return [
        {
          kind: 'main-checks',
          mapId: view.mapId,
          title: mainChecksItem({ mapId: view.mapId, runId: run.id, failing: state.failing }).title,
          since: run.finishedAt ?? run.startedAt,
          urgency: 'blocking',
          ref: run.id,
          holds: held.map((t) => t.id),
          notes: [
            ...(run.commit ? [`on ${run.branch ?? 'main'} at ${run.commit.slice(0, 8)}`] : []),
            held.length ? `${held.length} ready ticket${held.length === 1 ? '' : 's'} held back` : 'no new work starts',
          ],
        },
      ];
    });
  },
};
