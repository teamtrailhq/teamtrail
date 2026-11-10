import type { RerouteProposal } from '@teamtrail/core';

/**
 * The proposal a review that was opened on `id` shows now: when the agent replaced it while the dialog was open, the
 * newest one in its chain, with the id it replaced, so the dialog says so and approve never names a stale id.
 */
export function followProposal(all: Pick<RerouteProposal, 'id' | 'status' | 'supersededBy'>[], id?: string) {
  let at = id;
  for (let hops = 0; at && hops < all.length; hops++) {
    const p = all.find((x) => x.id === at);
    if (p?.status !== 'superseded' || !p.supersededBy) break;
    at = p.supersededBy;
  }
  return at !== id ? { id: at, replaced: id } : { id };
}
