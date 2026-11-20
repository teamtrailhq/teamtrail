import type { ReadinessTrail } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { trailLine } from './readinessText';
import { StartButton } from './StartButton';

/**
 * Each active trail while something blocks: what readiness holds there, and Start anyway (new implementation work
 * starts past what blocks now) or its undo. A blocking finding that comes up later holds the trail again.
 */
export function TrailStarts(props: {
  trails: ReadinessTrail[];
  now: number;
  busy: boolean;
  onStart: (mapId: string, undo: boolean) => void;
}) {
  if (!props.trails.length) return null;
  return (
    <ul className="rd-list">
      {props.trails.map((t) => (
        <Row
          key={t.mapId}
          as="li"
          edge={t.waits ? 'attention' : 'neutral'}
          title={t.title}
          context={<MetaLine parts={[trailLine(t, props.now)]} />}
          below={<StartButton trail={t} busy={props.busy} onStart={props.onStart} />}
        />
      ))}
    </ul>
  );
}
