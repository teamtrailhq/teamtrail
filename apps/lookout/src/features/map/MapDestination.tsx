import type { TrailDone } from '@teamtrail/core';
import { destinationTrail } from './destination';
import { DestinationMark } from './DestinationMark';
import { DestinationTrail } from './DestinationTrail';

/** The end of the trail: the last stretches and the mark, walked and flagged once the trail is done. */
export function MapDestination(props: {
  laid: Parameters<typeof destinationTrail>[0];
  spot: { x: number; y: number };
  text?: string;
  done?: TrailDone;
}) {
  const { laid, spot, done } = props;
  const reached = !!done && done.kind !== 'not-done';
  return (
    <>
      <DestinationTrail trails={destinationTrail(laid, spot)} travelled={reached} />
      {laid.nodes.length > 0 && <DestinationMark x={spot.x} y={spot.y} text={props.text} done={done} />}
    </>
  );
}
