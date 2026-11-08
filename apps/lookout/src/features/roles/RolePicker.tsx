import type { Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { Select } from '../../components/ui';
import { useRoles } from './useRoles';

const NONE = '';

/** The trail lead sets a ticket's role: any active role made for its type, or none. */
export function RolePicker(props: { mapId: string; ticket: Ticket }) {
  const { view, act } = useRoles();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const t = props.ticket;
  const fits = view.roles.filter((r) => r.status === 'active' && r.role?.handles.types.includes(t.type));
  const options = [
    { value: NONE, label: 'No role' },
    ...fits.map((r) => ({ value: r.id, label: r.role!.name, hint: r.role!.summary })),
  ];
  if (t.role && !fits.some((r) => r.id === t.role)) options.push({ value: t.role, label: t.role });
  const change = (role: string) => {
    setError(undefined);
    void act('/roles/ticket', { mapId: props.mapId, ticketId: t.id, role: role || null }).then(setError);
  };
  return (
    <span className="role-picker">
      <Select compact aria-label="Ticket role" value={t.role ?? NONE} options={options} onChange={change} />
      {error && <span className="vf-err">{error}</span>}
    </span>
  );
}
