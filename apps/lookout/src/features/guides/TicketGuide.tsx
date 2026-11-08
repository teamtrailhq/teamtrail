import type { Ticket } from '@teamtrail/core';
import { ChecklistPanel } from './ChecklistPanel';
import { GuideChip } from './GuideChip';
import { GuidePicker } from './GuidePicker';
import { GuideWarning } from './GuideWarning';
import { useGuides } from './useGuides';

/**
 * The inspector's guide section: the guide the ticket asks for, a warning when agents can't use it, the trail lead's
 * picker, and the agent's checklist answers. Hidden without a server.
 */
export function TicketGuide(props: { mapId: string; ticket: Ticket }) {
  const { view } = useGuides();
  const t = props.ticket;
  if (!view || (t.state !== 'open' && !t.guide)) return null;
  return (
    <section className="ticket-guide d-section">
      <span className="guide-head">
        <span className="t-label">Guide</span>
        {t.state === 'open' ? <GuidePicker mapId={props.mapId} ticket={t} /> : t.guide && <GuideChip id={t.guide} />}
      </span>
      {t.guide && <GuideWarning id={t.guide} />}
      <ChecklistPanel mapId={props.mapId} ticketId={t.id} />
    </section>
  );
}
