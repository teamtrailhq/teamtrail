import type { TrailDone } from '@teamtrail/core';
import { Button, LabelLine } from '../../components/ui';
import type { LiveTicket } from '../../lib/liveTickets';
import type { ProofStatuses } from '../map';
import { type TrailCounts, type TrailSegment, TrailSegments } from '../trail-bar';
import { MapStrip } from './MapStrip';
import { progressLabel } from './progressWords';
import { WorkingRows } from './WorkingRows';

/**
 * Progress on the trail on screen, as one card: how far it is in its label line, a segment per ticket in scope
 * coloured as on the trail bar, the map in short (the last ticket done, then what comes next, to the finish), one row
 * per agent at work, and Open the map (the full map is Hands-on's).
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
  const reached = props.done?.kind === 'verified';
  return (
    <section className="home-section home-panel home-progress" aria-labelledby="home-progress">
      <div className="home-bar">
        <h2 id="home-progress">
          <LabelLine parts={['Progress']} />
        </h2>
        <LabelLine
          className="home-counts"
          parts={progressLabel({ counts: props.counts, segments: props.segments, proofs: props.proofs, reached })}
        />
      </div>
      <div className="home-progress-body">
        <TrailSegments segments={props.segments} onSelect={props.onTicket} />
        <MapStrip segments={props.segments} reached={reached} onTicket={props.onTicket} />
      </div>
      <WorkingRows working={props.working} now={props.now} onTicket={props.onTicket} />
      <div className="home-panel-foot end">
        <Button variant="ghost" onClick={props.onFullMap}>
          Open the map
        </Button>
      </div>
    </section>
  );
}
