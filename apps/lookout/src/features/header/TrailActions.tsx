import type { MapDoc } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';

type Ask = 'start-over' | 'archive';

const ASKS: Record<Ask, { text: (m: MapDoc) => string; confirm: string }> = {
  'start-over': {
    text: (m) =>
      `Archive ${m.key} and start a new trail from its idea? The old map stays as history; its tickets and decisions don't carry over.`,
    confirm: 'Start over',
  },
  archive: {
    text: (m) => `Archive ${m.key}? It stays as history, read-only, and no agent takes work from it.`,
    confirm: 'Archive',
  },
};

/** What the trail lead can do with the trail on screen: start it over, archive it, or restore an archived one. */
export function TrailActions(props: {
  map: MapDoc;
  onStartOver: () => void;
  onArchive: (archived: boolean) => void;
  onDone: () => void;
}) {
  const { map } = props;
  const [ask, setAsk] = useState<Ask>();
  if (map.archived)
    return (
      <button
        role="menuitem"
        className="trail-item act"
        data-tip="Make it an active trail again: agents can take work from it"
        onClick={() => (props.onArchive(false), props.onDone())}
      >
        Restore {map.key}
      </button>
    );
  if (ask)
    return (
      <div className="trail-confirm" role="group">
        <p className="t-meta">{ASKS[ask].text(map)}</p>
        <div className="actions">
          <Button
            variant="primary"
            onClick={() => {
              if (ask === 'start-over') props.onStartOver();
              else props.onArchive(true);
              props.onDone();
            }}
          >
            {ASKS[ask].confirm}
          </Button>
          <Button onClick={() => setAsk(undefined)}>Cancel</Button>
        </div>
      </div>
    );
  return (
    <>
      <button
        role="menuitem"
        className="trail-item act"
        data-tip="The map went wrong? Archive it and describe the idea again"
        onClick={() => setAsk('start-over')}
      >
        Start {map.key} over…
      </button>
      <button
        role="menuitem"
        className="trail-item act"
        data-tip="Put the trail away as history"
        onClick={() => setAsk('archive')}
      >
        Archive {map.key}…
      </button>
    </>
  );
}
