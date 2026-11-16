import { Select } from '../../components/ui';
import { useGuides } from './useGuides';

const NONE = '';

/** The trail lead adds a guide to this ticket alone: any active guide it doesn't take on yet. */
export function AddTicketGuide(props: { taken: string[]; onAdd: (id: string) => void }) {
  const { view } = useGuides();
  if (!view) return null;
  const free = view.guides.filter((r) => r.status === 'active' && r.guide && !props.taken.includes(r.id));
  if (!free.length) return null;
  const options = [
    { value: NONE, label: 'Add a guide' },
    ...free.map((r) => ({ value: r.id, label: r.guide!.name, hint: r.guide!.summary })),
  ];
  return (
    <Select
      compact
      className="add-ticket-guide"
      aria-label="Add a guide to this ticket"
      value={NONE}
      options={options}
      onChange={(id) => id && props.onAdd(id)}
    />
  );
}
