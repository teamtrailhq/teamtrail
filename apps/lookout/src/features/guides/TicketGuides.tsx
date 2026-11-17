import type { MapDoc, Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { AddTicketGuide } from './AddTicketGuide';
import { TicketGuideChip } from './TicketGuideChip';
import { ticketGuideRows } from './ticketGuideRows';
import { useGuides } from './useGuides';

/**
 * Editing a ticket's guides, opened from the inspector's How section: every guide it takes on, from its type on the
 * trail or added to it, with the trail lead's remove (or put back) and add, for this ticket alone.
 */
export function TicketGuides(props: { map: MapDoc; ticket: Ticket }) {
  const { view, act } = useGuides();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const t = props.ticket;
  const rows = ticketGuideRows(props.map, t);
  const on = rows.filter((r) => !r.removed);
  const change = (body: { add: string } | { remove: string }) => {
    setError(undefined);
    void act('/guides/ticket', { mapId: props.map.id, ticketId: t.id, ...body }).then(setError);
  };
  return (
    <div className="ticket-guides">
      <span className="guide-head">
        {rows.map((r) => (
          <TicketGuideChip key={r.id} row={r} editable onChange={change} />
        ))}
        <AddTicketGuide taken={on.map((r) => r.id)} onAdd={(id) => change({ add: id })} />
      </span>
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
