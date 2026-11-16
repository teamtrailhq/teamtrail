import { type MapSnapshot, type TrailDone, trailDone } from '@teamtrail/core';
import { useMemo } from 'react';
import { useTrailProofs } from '../map';
import { proofsSettled } from './proofsSettled';

/**
 * Whether the current trail is done (core's `trailDone`), with the proofs it was judged on. `done` stays undefined
 * until every done ticket's proof has loaded, so a trail never shows as unverified for a moment before it shows as
 * verified.
 */
export function useTrailDone(snap: MapSnapshot | undefined, pendingReroutes: number) {
  const proofs = useTrailProofs(snap?.map.id, snap?.tickets);
  const done = useMemo((): TrailDone | undefined => {
    if (!snap || !proofs || !proofsSettled(snap.tickets, proofs)) return undefined;
    return trailDone({ tickets: snap.tickets, proofs, pendingReroutes });
  }, [snap, proofs, pendingReroutes]);
  return { proofs, done };
}
