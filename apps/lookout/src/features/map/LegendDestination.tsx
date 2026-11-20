import { DestinationGlyph } from './DestinationGlyph';
import type { DestinationState } from './types';

/** A legend row for the destination: its finish square, small, and what it means. */
export function LegendDestination({ state, text }: { state: DestinationState; text: string }) {
  return (
    <li>
      <svg
        className={state === 'ahead' ? 'destination' : `destination reached ${state}`}
        width="22"
        height="16"
        viewBox="-19 -14 38 28"
        aria-hidden="true"
      >
        <DestinationGlyph state={state} />
      </svg>
      {text}
    </li>
  );
}
