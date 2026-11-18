import type { MapSnapshot } from '@teamtrail/core';
import { useDiscoveryUi } from './useDiscoveryUi';
import { useRerouteUi } from './useRerouteUi';
import { useTrailDoneUi } from './useTrailDoneUi';

/**
 * Everything the current trail shows beyond its tickets: the discovery step (banner, Communication card, brief
 * review), reroutes (banner, map preview, review) and whether it's done (its proofs, the destination reached
 * dialog). Banners and dialogs come combined, so zones place them once.
 */
export function useTrailUi(input: {
  snap?: MapSnapshot;
  selectMap?: (mapId: string) => void;
  openTicket: (mapId: string, ticketId: string) => void;
  openTrailChecks: (mapId: string) => void;
}) {
  const { snap } = input;
  const discovery = useDiscoveryUi(snap);
  const reroute = useRerouteUi(snap, input.selectMap);
  const done = useTrailDoneUi({ snap, pendingReroutes: reroute.pending, ...input });
  return {
    briefText: discovery.briefText,
    inboxCard: discovery.inboxCard,
    review: discovery.review,
    banner: (
      <>
        {discovery.banner}
        {reroute.banner}
      </>
    ),
    preview: reroute.preview,
    proofs: done.proofs,
    done: done.done,
    openReroute: reroute.openReroute,
    dialog: (
      <>
        {discovery.dialog}
        {reroute.dialog}
        {done.dialog}
      </>
    ),
  };
}
