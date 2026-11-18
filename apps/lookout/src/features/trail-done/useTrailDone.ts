import type { MapSnapshot } from '@teamtrail/core';
import { useMemo } from 'react';
import { useTrailProofs } from '../map';
import { useTrailChecks } from '../trail-checks';
import { judgeTrail } from './judgeTrail';

/**
 * Whether the current trail is done (core's `trailDone`), with the proofs and the checks on main together it was
 * judged on. `done` stays undefined until every done ticket's proof, the trail's checks on main and its discovery stage
 * have loaded, so a trail never shows as unverified for a moment before it shows as verified, nor as done while
 * only its discovery is (its plan isn't charted yet).
 */
export function useTrailDone(input: {
  snap: MapSnapshot | undefined;
  pendingReroutes: number;
  /** Whether the trail lead skipped discovery here (GET /briefs `skipped`); undefined until loaded. */
  discovery: { skipped: boolean } | undefined;
}) {
  const { snap, pendingReroutes } = input;
  const skipped = input.discovery?.skipped;
  const proofs = useTrailProofs(snap?.map.id, snap?.tickets);
  const checks = useTrailChecks(snap?.map.id).view;
  const together = checks && checks.mapId === snap?.map.id ? checks.together : undefined;
  const done = useMemo(
    () => judgeTrail({ snap, proofs, together, skipped, pendingReroutes }),
    [snap, proofs, pendingReroutes, together, skipped],
  );
  return { proofs, done };
}
