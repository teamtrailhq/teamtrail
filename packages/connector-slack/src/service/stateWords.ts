import type { NodeState } from '@teamtrail/core';

/** A ticket's state as people say it. */
export const STATE_WORDS: Record<NodeState, string> = {
  decided: 'decided',
  claimed: 'in progress',
  frontier: 'ready to claim',
  blocked: 'blocked',
  parked: 'parked',
  'out-of-scope': 'ruled out',
  verifying: 'verifying',
  rework: 'needs rework',
  held: 'held: changed outside Teamtrail',
};
