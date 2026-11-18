import type { GateEntry } from '@teamtrail/core';
import { Disclosure, MetaLine, Row } from '../../components/ui';
import { sinceLabel } from '../../lib/sinceLabel';

const WHAT: Record<GateEntry['mode'], string> = { enforce: 'Held', observe: 'Would have held' };

/**
 * A gate's recent entries, opened on click: the reason first, then the ticket and what the gate did. A row with a
 * ticket opens it on the map.
 */
export function GateEntries(props: { entries: GateEntry[]; onOpenTicket: (mapId: string, ticketId: string) => void }) {
  if (!props.entries.length) return null;
  const now = Date.now();
  return (
    <Disclosure label={`Tickets (${props.entries.length})`}>
      <ul className="gate-entries">
        {props.entries.map((e, i) => {
          const ticketId = e.ticketId;
          return (
            <Row
              key={`${e.at}-${i}`}
              as="li"
              className="gate-entry"
              edge={e.mode === 'enforce' ? 'attention' : 'neutral'}
              title={e.reason}
              titleText={e.reason}
              context={<MetaLine parts={[e.ticketKey && { text: e.ticketKey, code: true }, WHAT[e.mode]]} />}
              trailing={sinceLabel(e.at, now)}
              onOpen={ticketId ? () => props.onOpenTicket(e.mapId, ticketId) : undefined}
            />
          );
        })}
      </ul>
    </Disclosure>
  );
}
