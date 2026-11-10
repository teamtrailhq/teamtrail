import type { MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { mapPreview } from '../features/map';
import { DISMISS_NOTE, followProposal, RerouteBanner, RerouteDialog, useReroutes } from '../features/reroute';

/**
 * The reroute pieces for the current trail: the map banner while a proposal is pending, the preview drawn over the
 * map (the open proposal, else the pending one), the review dialog, and `openReroute` for other zones (attention).
 */
export function useRerouteUi(snap?: MapSnapshot, selectMap?: (mapId: string) => void) {
  const r = useReroutes(snap);
  const [openId, setOpenId] = useState<string>();
  // The agent may replace the proposal while the dialog is open: follow it to the newest, and say so.
  const followed = followProposal(r.reroutes, openId);
  const shown = r.reroutes.find((p) => p.id === followed.id);
  const previewed = shown?.diff ? shown : r.pending;
  const close = () => {
    setOpenId(undefined);
    r.clearError();
  };
  const closeIf = (ok: boolean) => ok && close();
  const pending = r.pending;
  return {
    banner: pending && (
      <RerouteBanner
        reroute={pending}
        onReview={() => setOpenId(pending.id)}
        onDismiss={() => void r.reject(pending.id, DISMISS_NOTE)}
      />
    ),
    preview: snap && previewed?.diff ? mapPreview(snap, previewed.diff, previewed.frozen) : undefined,
    /** Opens a proposal's review, switching to its trail first when it's another one. */
    openReroute: (mapId: string, id: string) => {
      if (mapId !== snap?.map.id) selectMap?.(mapId);
      setOpenId(id);
    },
    dialog: snap && shown && (
      <RerouteDialog
        key={shown.id}
        reroute={shown}
        replaced={followed.replaced}
        snap={snap}
        error={r.error}
        onApprove={(note) => void r.approve(shown.id, note || undefined).then(closeIf)}
        onReject={(note) => void r.reject(shown.id, note).then(closeIf)}
        onClose={close}
      />
    ),
  };
}
