import { type MapSnapshot, type TrailDone, trailDone } from '@teamtrail/core';
import { useMemo } from 'react';
import { useTrailProofs } from '../map';
import { useTrailChecks } from '../trail-checks';
import { proofsSettled } from './proofsSettled';

/**
 * Whether the current trail is done (core's `trailDone`), with the proofs and the checks on main together it was
 * judged on. `done` stays undefined until every done ticket's proof and the trail's checks on main have loaded, so a
 * trail never shows as unverified for a moment before it shows as verified.
 */
export function useTrailDone(snap: MapSnapshot | undefined, pendingReroutes: number) {
  const proofs = useTrailProofs(snap?.map.id, snap?.tickets);
  const checks = useTrailChecks(snap?.map.id).view;
  const together = checks && checks.mapId === snap?.map.id ? checks.together : undefined;
  const done = useMemo((): TrailDone | undefined => {
    if (!snap || !proofs || !together || !proofsSettled(snap.tickets, proofs)) return undefined;
    return trailDone({ tickets: snap.tickets, proofs, pendingReroutes, together });
  }, [snap, proofs, pendingReroutes, together]);
  return { proofs, done };
}
