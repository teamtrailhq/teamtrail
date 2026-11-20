import type { TrailDone } from '@teamtrail/core';
import { cx } from '../../lib';
import { DestinationGlyph, destinationState } from '../map';

/** The map's finish square on its own, as the trail ended: for the Current trail step and Destination reached. */
export function DestinationMarkArt({ done, size }: { done: Exclude<TrailDone, { kind: 'not-done' }>; size: number }) {
  const state = destinationState(done);
  return (
    <svg
      className={cx('destination', 'reached', done.kind, state === 'failing' && 'failing')}
      width={size}
      height={size}
      viewBox="-14 -14 28 28"
      aria-hidden="true"
    >
      <DestinationGlyph state={state} />
    </svg>
  );
}
