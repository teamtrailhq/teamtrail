import { useState } from 'react';
import { LegendDestination } from './LegendDestination';
import { LegendSwatch, type Swatch } from './LegendSwatch';

const ROWS: { swatch: Swatch; text: string }[] = [
  { swatch: 'working', text: 'An agent is on it' },
  { swatch: 'needs', text: 'Needs you' },
  { swatch: 'held', text: 'Held up' },
  { swatch: 'ready', text: 'Waiting for an agent' },
  { swatch: 'backlog', text: 'Not started yet' },
  { swatch: 'verified', text: 'Done and verified' },
  { swatch: 'done', text: 'Done, not verified' },
  { swatch: 'cancelled', text: 'Ruled out' },
];

/** What the cards and the destination's finish square mean, one click away in the map's corner. */
export function MapLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="map-legend" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {open && (
        <ul className="map-legend-list">
          {ROWS.map((r) => (
            <li key={r.text}>
              <LegendSwatch swatch={r.swatch} />
              {r.text}
            </li>
          ))}
          <LegendDestination state="ahead" text="Destination, ahead" />
          <LegendDestination state="verified" text="Destination reached and verified" />
        </ul>
      )}
      <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide legend' : 'Legend'}
      </button>
    </div>
  );
}
