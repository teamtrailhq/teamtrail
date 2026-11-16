import { reviewLimitHeld } from '../../reviewLoad/reviewLimitHeld';
import { reviewLoad } from '../../reviewLoad/reviewLoad';
import type { AttentionSource, Candidate } from '../types';

/**
 * The review limit is reached: agents start no new implementation work until the human reviews some of what waits.
 * One item for the project; it opens the oldest waiting ticket, the one to review first.
 */
export const reviewLimitSource: AttentionSource = {
  kind: 'review-limit',
  collect({ snaps, approvals, syncs, policy }) {
    const load = reviewLoad({ approvals, syncs, limit: policy?.reviewLimit });
    const oldest = load.waiting[0];
    if (!load.full || !oldest) return [];
    const held = snaps.flatMap((s) => reviewLimitHeld(s, load).map((t) => t.id));
    const n = load.waiting.length;
    const c: Candidate = {
      kind: 'review-limit',
      mapId: oldest.mapId,
      ticketId: oldest.ticketId,
      title: `Review ${n} finished ticket${n === 1 ? '' : 's'}: agents wait for you`,
      since: oldest.since,
      urgency: 'soon',
      ref: 'review-limit',
      holds: held,
      batchKey: 'review-limit',
      notes: [
        `${n} waiting, the team's limit is ${load.limit}`,
        held.length ? `${held.length} ready ticket${held.length === 1 ? '' : 's'} held back` : 'no new work starts',
        `start with ${oldest.ticketKey}, waiting longest`,
      ],
    };
    return [c];
  },
};
