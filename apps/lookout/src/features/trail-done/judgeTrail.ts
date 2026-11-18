import { type MapSnapshot, type TrailDone, type TrailTogether, trailDone } from '@teamtrail/core';
import type { ProofStatuses } from '../map';
import { proofsSettled } from './proofsSettled';

/**
 * Core's `trailDone` for the trail on the page, or undefined while something it needs hasn't loaded: every done
 * ticket's proof, the checks on main together, and whether discovery was skipped here (`skipped`). Judging without
 * the last would count a trail whose only ticket, its discovery research, is done as having reached its destination.
 */
export function judgeTrail(input: {
  snap: MapSnapshot | undefined;
  proofs: ProofStatuses | undefined;
  together: TrailTogether | undefined;
  skipped: boolean | undefined;
  pendingReroutes: number;
}): TrailDone | undefined {
  const { snap, proofs, together, skipped } = input;
  if (!snap || !proofs || !together || skipped === undefined) return undefined;
  if (!proofsSettled(snap.tickets, proofs)) return undefined;
  const { pendingReroutes } = input;
  return trailDone({ tickets: snap.tickets, proofs, pendingReroutes, together, discoverySkipped: skipped });
}
