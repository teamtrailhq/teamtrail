import type { TrailDone } from '@teamtrail/core';
import { FlagShape } from './FlagShape';

/**
 * Where the trail ends: a small, bold hand-drawn X while it's ahead, a planted flag once the trail is done (in the
 * colour of passed checks when every ticket is verified, muted when some aren't). No label on the map; hovering or
 * focusing it says what the destination is.
 */
export function DestinationMark({ x, y, text, done }: { x: number; y: number; text?: string; done?: TrailDone }) {
  const where = text?.trim() || 'Where this trail ends';
  const reached = done && done.kind !== 'not-done';
  const tip = reached ? `Destination reached · ${done.reason}\n${where}` : `Destination\n${where}`;
  const classes = reached ? `destination reached ${done.kind}` : 'destination';
  return (
    <g className={classes} transform={`translate(${x} ${y})`} aria-label={tip} data-tip={tip} tabIndex={0}>
      <rect className="x-hit" x={-24} y={-24} width={48} height={48} />
      {reached ? (
        <FlagShape />
      ) : (
        <>
          <path className="x-stroke" d="M-15 -16 C-9 -10 2 4 16 17" />
          <path className="x-stroke" d="M17 -15 C8 -8 -6 5 -16 17" />
        </>
      )}
    </g>
  );
}
