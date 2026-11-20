import type { TrailDone } from '@teamtrail/core';
import { cx } from '../../lib';
import { summaryLine } from '../../lib/markdown';
import { DestinationGlyph } from './DestinationGlyph';
import { destinationState } from './destinationState';

/**
 * Where the trail ends: the finish square (`DestinationGlyph`), a ring with an accent centre while it's ahead, filled
 * once the trail is done (green when verified, rose when its checks fail on main together, a muted outline when it
 * isn't verified). No label on the map; hovering or focusing it says what the destination is. Clicking it opens the
 * trail's checks on main together in the bubble; selected, it gets a ring like `main` and the cards.
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
  const state = destinationState(done);
  const reached = state !== 'ahead';
  const tip = reached ? `Destination reached · ${done?.reason}\n${where}` : `Destination\n${where}`;
  const classes = cx(
    'destination',
    reached && `reached ${done?.kind}`,
    state === 'failing' && 'failing',
    props.selected && 'sel',
  );
  return (
    <g
      className={classes}
      transform={`translate(${x} ${y})`}
      aria-label={tip}
      data-tip={tip}
      data-done={done?.kind}
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
      <rect className="dest-hit" x={-24} y={-24} width={48} height={48} />
      {/* 5 outside the 24-unit square */}
      <rect className="dest-ring" x={-17} y={-17} width={34} height={34} />
      <DestinationGlyph state={state} />
    </g>
  );
}
