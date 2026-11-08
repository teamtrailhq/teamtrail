import type { Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { Select } from '../../components/ui';
import { useGuides } from './useGuides';

const NONE = '';

/** The trail lead sets a ticket's guide: any active guide made for its type, or none. */
export function GuidePicker(props: { mapId: string; ticket: Ticket }) {
  const { view, act } = useGuides();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const t = props.ticket;
  const fits = view.guides.filter((r) => r.status === 'active' && r.guide?.handles.types.includes(t.type));
  const options = [
    { value: NONE, label: 'No guide' },
    ...fits.map((r) => ({ value: r.id, label: r.guide!.name, hint: r.guide!.summary })),
  ];
  if (t.guide && !fits.some((r) => r.id === t.guide)) options.push({ value: t.guide, label: t.guide });
  const change = (guide: string) => {
    setError(undefined);
    void act('/guides/ticket', { mapId: props.mapId, ticketId: t.id, guide: guide || null }).then(setError);
  };
  return (
    <span className="guide-picker">
      <Select compact aria-label="Ticket guide" value={t.guide ?? NONE} options={options} onChange={change} />
      {error && <span className="vf-err">{error}</span>}
    </span>
  );
}
