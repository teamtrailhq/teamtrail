import type { TrailDone } from '@teamtrail/core';
import type { DestinationState } from './types';

/** The mark's state from core's `trailDone`: failing when the trail's checks fail on main together. */
export function destinationState(done?: TrailDone): DestinationState {
  if (!done || done.kind === 'not-done') return 'ahead';
  if (done.kind === 'verified') return 'verified';
  return done.together.kind === 'failed' ? 'failing' : 'unverified';
}
