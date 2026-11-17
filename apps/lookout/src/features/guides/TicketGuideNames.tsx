import type { MapDoc, Ticket } from '@teamtrail/core';
import { GuideWarning } from './GuideWarning';
import { TicketGuideChip } from './TicketGuideChip';
import { ticketGuideRows } from './ticketGuideRows';
import { useGuides } from './useGuides';

/**
 * A ticket's guides as plain names, each saying whether its type gives it or it was added here, and why a guide
 * agents can't use gives them nothing. "None" without guides; nothing without a server.
 */
export function TicketGuideNames(props: { map: MapDoc; ticket: Ticket }) {
  const { view } = useGuides();
  if (!view) return null;
  const on = ticketGuideRows(props.map, props.ticket).filter((r) => !r.removed);
  if (!on.length) return <span className="t-meta">None</span>;
  return (
    <>
      <span className="ticket-guides plain">
        {on.map((r) => (
          <TicketGuideChip key={r.id} row={r} editable={false} onChange={() => {}} />
        ))}
      </span>
      {on.map((r) => (
        <GuideWarning key={r.id} id={r.id} />
      ))}
    </>
  );
}
