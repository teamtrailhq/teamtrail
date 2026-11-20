import type { ReadinessTrail } from '@teamtrail/core';
import { Button } from '../../components/ui';

/** Start anyway while blocking findings hold the trail, else its undo when the trail lead made one. */
export function StartButton(props: {
  trail: ReadinessTrail;
  busy: boolean;
  onStart: (mapId: string, undo: boolean) => void;
}) {
  const { trail } = props;
  if (trail.waits)
    return (
      <Button
        size="sm"
        disabled={props.busy}
        data-tip="Agents start new implementation work on this trail now; checks that can't run will send it back"
        onClick={() => props.onStart(trail.mapId, false)}
      >
        Start anyway
      </Button>
    );
  if (!trail.startedAnyway) return null;
  return (
    <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onStart(trail.mapId, true)}>
      Undo start anyway
    </Button>
  );
}
