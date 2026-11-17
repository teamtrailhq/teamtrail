import { Empty, MetaLine, Row, SectionHeader } from '../../components/ui';
import type { LiveTicket } from '../../lib/liveTickets';
import { upNextRows } from './upNextRows';

/** Up next: what an agent picks up next, and what waits on you to move. A row opens the ticket's bubble. */
export function UpNextList(props: { live: LiveTicket[]; now: number; onTicket: (ticketId: string) => void }) {
  const rows = upNextRows(props.live, props.now);
  return (
    <section className="panel trail-list upnext-list">
      <SectionHeader title="Up next" count={<span className="n mono-label">{rows.length}</span>} />
      {rows.length === 0 && <Empty>Nothing ready</Empty>}
      <ul className="trail-list-rows">
        {rows.map((r) => (
          <Row
            key={r.ticket.id}
            as="li"
            title={`${r.ticket.key} ${r.ticket.title}`}
            context={<MetaLine parts={[r.context]} />}
            onOpen={() => props.onTicket(r.ticket.id)}
          />
        ))}
      </ul>
    </section>
  );
}
