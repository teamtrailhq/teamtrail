import type { AttentionView, MapSnapshot } from '@teamtrail/core';
import { LabelLine, Row, SceneCard } from '../../components/ui';
import { edgeFor } from '../attention';
import { glanceWaitParts } from './glanceWaitParts';

type Item = AttentionView['items'][number];

/** Everything on the trail that waits on you, each a row: its label line and title. Rose only for what needs you now. */
export function GlanceWaits(props: {
  snap: MapSnapshot;
  items: Item[];
  interrupting: string[];
  now: number;
  onItem: (item: Item) => void;
}) {
  const keys = new Map(props.snap.tickets.map((t) => [t.id, t.key]));
  const edges = props.items.map((i) => edgeFor(i, props.interrupting.includes(i.id)));
  const urgent = edges.includes('urgent');
  return (
    <SceneCard
      className="glance-card glance-waits"
      label={<LabelLine parts={['Waits on you', String(props.items.length)]} tone={urgent ? 'urgent' : 'dim'} />}
    >
      <ul className="row-list">
        {props.items.map((item, n) => (
          <Row
            key={item.id}
            as="li"
            edge={edges[n]}
            label={
              <LabelLine
                parts={glanceWaitParts({ item, keyOf: (id) => keys.get(id), now: props.now })}
                tone={edges[n] === 'urgent' ? 'urgent' : 'plain'}
              />
            }
            title={item.title.split('\n')[0]}
            onOpen={() => props.onItem(item)}
          />
        ))}
      </ul>
    </SceneCard>
  );
}
