import { modelWaits } from '../../planning/matching/modelWaits';
import type { AttentionSource, Candidate } from '../types';

/**
 * Model matching: a ready ticket set for a stronger model than any connected agent runs. It waits rather than run on
 * a weaker model; the human connects an agent on a stronger model, or has one claim it by key.
 */
export const modelSource: AttentionSource = {
  kind: 'model',
  collect({ snaps, agents }) {
    return snaps.flatMap((snap) =>
      modelWaits(snap, agents ?? []).map((w): Candidate => ({
        kind: 'model',
        mapId: w.mapId,
        ticketId: w.ticketId,
        title: `${w.ticketKey} needs a ${w.tier} model`,
        since: w.since,
        urgency: 'soon',
        ref: w.ticketId,
        holds: [w.ticketId],
        notes: [
          `connected agents run ${w.best} at most`,
          `connect an agent on a ${w.tier} model, or claim ${w.ticketKey} by key`,
        ],
      })),
    );
  },
};
