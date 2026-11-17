import type { BriefStatus, NodeState } from '@teamtrail/core';

export type TrailPhase = 'discovery' | 'brief' | 'building' | 'review' | 'done';

export const TRAIL_PHASES: { phase: TrailPhase; label: string }[] = [
  { phase: 'discovery', label: 'Discovery' },
  { phase: 'brief', label: 'Brief' },
  { phase: 'building', label: 'Building' },
  { phase: 'review', label: 'Review' },
  { phase: 'done', label: 'Done' },
];

const SETTLED = new Set<NodeState>(['decided', 'out-of-scope']);
const IN_REVIEW = new Set<NodeState>(['verifying', 'held']);

/**
 * Where a trail is, from core's signals: done once `trailDone` says so; while discovery holds implementation, its
 * research (Discovery) or the brief waiting on the trail lead (Brief); Review once every open ticket waits on
 * verification; Building otherwise.
 */
export function trailPhase(input: {
  done: boolean;
  /** Discovery still holds the trail's implementation tickets (GET /briefs `gated`). */
  gated: boolean;
  briefStatus?: BriefStatus;
  states: NodeState[];
}): TrailPhase {
  if (input.done) return 'done';
  if (input.gated) return input.briefStatus === 'submitted' ? 'brief' : 'discovery';
  const open = input.states.filter((s) => !SETTLED.has(s));
  if (open.length && open.every((s) => IN_REVIEW.has(s))) return 'review';
  return 'building';
}
