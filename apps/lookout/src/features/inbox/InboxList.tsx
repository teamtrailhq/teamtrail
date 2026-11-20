import { questionHeadline, type PendingQuestion, type MapSnapshot } from '@teamtrail/core';
import { EmptyState, MetaLine, Row } from '../../components/ui';
import { useNow } from '../../hooks';
import { ago } from '../../lib';

/**
 * Open questions before the ranked queue has loaded (or where the server has none): the question as the title,
 * who asks and on which ticket as the context line, and the wait on the right.
 */
export function InboxList(props: {
  items: PendingQuestion[];
  snaps: Record<string, MapSnapshot>;
  currentMapId?: string;
  selected?: string;
  onOpen: (sessionId: string, ticketId?: string) => void;
}) {
  const now = useNow(1000);
  if (!props.items.length)
    return <EmptyState title="Nothing waiting on you" hint="When an agent needs your call, its question lands here." />;
  return (
    <ul className="inbox-list">
      {props.items.map((q) => {
        const s = props.snaps[q.mapId];
        const t = s?.tickets.find((x) => x.id === q.ticketId);
        const otherTrail = q.mapId !== props.currentMapId ? s?.map.title : undefined;
        const title = questionHeadline(q).text;
        return (
          <Row
            key={q.id}
            as="li"
            className={q.sessionId === props.selected ? 'sel' : undefined}
            edge={q.urgency === 'blocking' ? 'urgent' : 'neutral'}
            selected={q.sessionId === props.selected}
            title={title}
            titleText={title}
            context={
              <MetaLine
                parts={[
                  q.urgency === 'blocking' && { text: 'Blocking', urgent: true },
                  `${q.agent} asks`,
                  t && { text: t.key, code: true },
                  t?.title,
                  otherTrail,
                ]}
              />
            }
            trailing={ago(now - q.at)}
            onOpen={() => props.onOpen(q.sessionId, q.ticketId)}
          />
        );
      })}
    </ul>
  );
}
