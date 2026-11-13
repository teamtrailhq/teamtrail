import { NewTrailDialog, type TrailSeed } from '../features/trail';
import { createTrail, type Runtime } from '../lib';

/** New trail: create it here (any agent picks it up with /scout resume), or draft /scout new for the agent's chat. */
export function AppNewTrail(props: {
  rt: Runtime;
  /** Start over: the archived trail's idea, to fix before charting it again. */
  seed?: TrailSeed;
  onClose: () => void;
  onCreated: (mapId: string) => void;
}) {
  return (
    <NewTrailDialog
      seed={props.seed}
      onClose={props.onClose}
      tracker={props.rt.adapter.label}
      onCreate={async (input) => {
        const map = await createTrail(props.rt.adapter, input);
        props.onCreated(map.id);
        return map;
      }}
    />
  );
}
