import type { TrailDone } from '@teamtrail/core';
import { cx } from '../../lib';
import { summaryLine } from '../../lib/markdown';
import { FlagShape } from './FlagShape';

/**
 * Where the trail ends: a small, bold hand-drawn X while it's ahead, a planted flag once the trail is done (in the
 * colour of passed checks when the trail is verified, muted when it isn't, red when its checks fail on main together).
 * No label on the map; hovering or focusing it says what the destination is. Clicking it opens the trail's checks on
 * main together in the bubble.
 */
export function DestinationMark(props: {
  x: number;
  y: number;
  text?: string;
  done?: TrailDone;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { x, y, text, done, onSelect } = props;
  const where = (text && summaryLine(text)) || 'Where this trail ends';
  const reached = done && done.kind !== 'not-done';
  const tip = reached ? `Destination reached · ${done.reason}\n${where}` : `Destination\n${where}`;
  const failing = done?.kind === 'unverified' && done.together.kind === 'failed';
  const classes = cx('destination', reached && `reached ${done.kind}`, failing && 'failing', props.selected && 'sel');
  return (
    <g
      className={classes}
      transform={`translate(${x} ${y})`}
      aria-label={tip}
      data-tip={tip}
      tabIndex={0}
      role={onSelect ? 'button' : undefined}
      onClick={(e) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) onSelect();
      }}
    >
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
