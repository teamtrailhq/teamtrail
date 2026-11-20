import type { Ticket } from '@teamtrail/core';
import { LabelLine, Row, SceneCard } from '../../components/ui';
import { TYPE_TEXT } from '../../lib';

const SHOWN = 5;

/** What is ready for an agent next: type · key · ready on the label line, the title under it; the first five. */
export function GlanceNext(props: { ready: Ticket[]; onTicket: (id: string) => void }) {
  const more = props.ready.length - SHOWN;
  return (
    <SceneCard
      className="glance-card glance-next"
      label={<LabelLine parts={['Up next', String(props.ready.length)]} tone="dim" />}
      foot={more > 0 && <span className="t-meta">{more} more ready on the map</span>}
    >
      <ul className="row-list">
        {props.ready.slice(0, SHOWN).map((t) => (
          <Row
            key={t.id}
            as="li"
            label={<LabelLine parts={[TYPE_TEXT[t.type], t.key, 'ready']} />}
            title={t.title}
            onOpen={() => props.onTicket(t.id)}
          />
        ))}
      </ul>
    </SceneCard>
  );
}
