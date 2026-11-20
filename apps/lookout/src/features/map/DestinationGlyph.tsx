import type { DestinationState } from './types';

/** Half the finish square's side, in map units. */
const DEST_HALF = 12;

/**
 * The finish square, centred on 0,0 (24 map units a side). Ahead, a ring in the accent with a small square in its
 * centre; reached, it fills: green with a check when verified, rose with a cross when its checks fail on main
 * together, a muted outline with a muted check when not verified. Colours come from the `destination` classes in
 * map.css, so the same glyph serves the map, the Current trail step, the dialog and the legend.
 */
export function DestinationGlyph({ state }: { state: DestinationState }) {
  const h = DEST_HALF;
  if (state === 'ahead')
    return (
      <>
        <rect className="dest-frame" x={-h} y={-h} width={2 * h} height={2 * h} />
        <rect className="dest-core" x={-4} y={-4} width={8} height={8} />
      </>
    );
  if (state === 'unverified')
    return (
      <>
        <rect className="dest-frame" x={1 - h} y={1 - h} width={2 * h - 2} height={2 * h - 2} />
        <path className="dest-sign muted" d="M-4 0l3 3 5.5 -6.5" />
      </>
    );
  return (
    <>
      <rect className="dest-fill" x={-h} y={-h} width={2 * h} height={2 * h} />
      <path className="dest-sign" d={state === 'verified' ? 'M-4 0l3 3 5.5 -6.5' : 'M-3.5 -3.5l7 7M3.5 -3.5l-7 7'} />
    </>
  );
}
