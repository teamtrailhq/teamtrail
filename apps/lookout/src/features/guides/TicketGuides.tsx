import type { MapDoc, Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { AddTicketGuide } from './AddTicketGuide';
import { ChecklistPanel } from './ChecklistPanel';
import { GuideWarning } from './GuideWarning';
import { TicketGuideChip } from './TicketGuideChip';
import { ticketGuideRows } from './ticketGuideRows';
import { useGuides } from './useGuides';

/**
 * The inspector's guides: every guide the ticket takes on, from its type on the trail or added to it, with the trail
 * lead's add and remove for this ticket alone while it's open; a warning for a guide agents can't use; and the
 * agent's checklist answers. Hidden without a server, and on a closed ticket that had none.
 */
export function TicketGuides(props: { map: MapDoc; ticket: Ticket }) {
  const { view, act } = useGuides();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const t = props.ticket;
  const open = t.state === 'open';
  const rows = ticketGuideRows(props.map, t).filter((r) => open || !r.removed);
  if (!open && !rows.length) return null;
  const on = rows.filter((r) => !r.removed);
  const change = (body: { add: string } | { remove: string }) => {
    setError(undefined);
    void act('/guides/ticket', { mapId: props.map.id, ticketId: t.id, ...body }).then(setError);
  };
  return (
    <section className="ticket-guides d-section">
      <span className="guide-head">
        <span className="t-label">Guides</span>
        {rows.map((r) => (
          <TicketGuideChip key={r.id} row={r} editable={open} onChange={change} />
        ))}
        {open && <AddTicketGuide taken={on.map((r) => r.id)} onAdd={(id) => change({ add: id })} />}
      </span>
      {error && <span className="vf-err">{error}</span>}
      {on.map((r) => (
        <GuideWarning key={r.id} id={r.id} />
      ))}
      <ChecklistPanel mapId={props.map.id} ticketId={t.id} />
    </section>
  );
}
