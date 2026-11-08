import type { Ticket } from '@teamtrail/core';
import { ChecklistPanel } from './ChecklistPanel';
import { RoleChip } from './RoleChip';
import { RolePicker } from './RolePicker';
import { RoleWarning } from './RoleWarning';
import { useRoles } from './useRoles';

/**
 * The inspector's role section: the role the ticket asks for, a warning when agents can't use it, the trail lead's
 * picker, and the agent's checklist answers. Hidden without a server.
 */
export function TicketRole(props: { mapId: string; ticket: Ticket }) {
  const { view } = useRoles();
  const t = props.ticket;
  if (!view || (t.state !== 'open' && !t.role)) return null;
  return (
    <section className="ticket-role d-section">
      <span className="role-head">
        <span className="t-label">Role</span>
        {t.state === 'open' ? <RolePicker mapId={props.mapId} ticket={t} /> : t.role && <RoleChip id={t.role} />}
      </span>
      {t.role && <RoleWarning id={t.role} />}
      <ChecklistPanel mapId={props.mapId} ticketId={t.id} />
    </section>
  );
}
