import type { MapSnapshot } from '@teamtrail/core';
import {
  openPullRequests,
  scrollToProof,
  TrailDoneDialog,
  useTrailDone,
  useTrailDoneDialog,
} from '../features/trail-done';
import { usePrSync } from '../hooks';

/**
 * Whether the current trail is done, the proofs that says it on, and the "destination reached" dialog once per trail:
 * Review pull requests opens the first done ticket whose pull request is still open, at its Proof section; See what
 * fails opens the destination's checks on main together.
 */
export function useTrailDoneUi(input: {
  snap?: MapSnapshot;
  pendingReroutes: number;
  /** Whether discovery was skipped here, once loaded: the trail isn't judged before. */
  discovery?: { skipped: boolean };
  openTicket: (mapId: string, ticketId: string) => void;
  openTrailChecks: (mapId: string) => void;
}) {
  const { snap } = input;
  const { proofs, done } = useTrailDone({ snap, pendingReroutes: input.pendingReroutes, discovery: input.discovery });
  const announce = useTrailDoneDialog(snap, done);
  const sync = usePrSync();
  const pulls = snap ? openPullRequests(sync, snap) : [];
  const review = () => {
    announce.close();
    if (!snap || !pulls.length) return;
    input.openTicket(snap.map.id, pulls[0]);
    scrollToProof();
  };
  const checks = () => {
    announce.close();
    if (snap) input.openTrailChecks(snap.map.id);
  };
  const dialog = announce.show && done && done.kind !== 'not-done' && (
    <TrailDoneDialog done={done} pulls={pulls.length} onReview={review} onChecks={checks} onClose={announce.close} />
  );
  return { proofs, done, dialog };
}
