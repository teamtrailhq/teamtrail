import { useState } from 'react';
import type { NodeTone } from './nodeTone';
import { StatusDot } from './StatusDot';

const ROWS: { tone: NodeTone; verified?: boolean; spin?: boolean; urgent?: boolean; text: string }[] = [
  { tone: 'working', text: 'An agent is on it' },
  { tone: 'attention', urgent: true, text: 'Needs you' },
  { tone: 'attention', text: 'Held up' },
  { tone: 'ready', spin: true, text: 'Waiting for an agent' },
  { tone: 'backlog', text: 'Not started yet' },
  { tone: 'done', verified: true, text: 'Done and verified' },
  { tone: 'done', text: 'Done, not verified' },
  { tone: 'cancelled', text: 'Ruled out' },
];

/** What the cards' dots mean, one click away in the map's corner. */
export function MapLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="map-legend" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {open && (
        <ul className="map-legend-list">
          {ROWS.map((r) => (
            <li key={r.text}>
              <svg
                className={r.urgent ? 'node waiting' : 'node'}
                width="22"
                height="16"
                viewBox="4 0 18 16"
                aria-hidden="true"
              >
                <StatusDot tone={r.tone} cy={8} verified={r.verified} spin={r.spin} />
              </svg>
              {r.text}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide legend' : 'Legend'}
      </button>
    </div>
  );
}
