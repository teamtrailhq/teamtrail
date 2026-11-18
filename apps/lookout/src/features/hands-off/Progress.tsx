import type { TrailDone } from '@teamtrail/core';
import { useState } from 'react';
import { MetaLine } from '../../components/ui';
import type { LiveTicket } from '../../lib/liveTickets';
import type { ProofStatuses } from '../map';
import { type TrailCounts, type TrailSegment, TrailSegments } from '../trail-bar';
import { MapStrip } from './MapStrip';
import { progressWords } from './progressWords';
import { WorkingRows } from './WorkingRows';

/**
 * Progress on the trail on screen: a segment per ticket in scope coloured as on the trail bar (the ones at work
 * breathe), the counts in one line, the map in short on request (the full map is Hands-on's), and one row per agent
 * at work.
 */
export function Progress(props: {
  segments: TrailSegment[];
  counts: TrailCounts;
  proofs?: ProofStatuses;
  done?: TrailDone;
  working: LiveTicket[];
  now: number;
  onTicket: (ticketId: string) => void;
  onFullMap: () => void;
}) {
  const [map, setMap] = useState(false);
  const reached = props.done?.kind === 'verified';
  return (
    <section className="home-section home-progress" aria-labelledby="home-progress">
      <div className="home-head">
        <h2 id="home-progress" className="t-label">
          Progress
        </h2>
        <button type="button" className="link" aria-expanded={map} onClick={() => setMap(!map)}>
          {map ? 'Hide the map' : 'Show the map'}
        </button>
      </div>
      <TrailSegments segments={props.segments} onSelect={props.onTicket} />
      <MetaLine
        className="home-counts"
        parts={[
          reached && { text: 'Destination reached', strong: true },
          ...progressWords(props.counts, props.segments, props.proofs),
        ]}
      />
      {map && <MapStrip segments={props.segments} onTicket={props.onTicket} onFullMap={props.onFullMap} />}
      <WorkingRows working={props.working} now={props.now} onTicket={props.onTicket} />
    </section>
  );
}
