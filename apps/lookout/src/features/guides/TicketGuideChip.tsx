import { cx } from '../../lib';
import type { TicketGuideRow } from './ticketGuideRows';
import { useGuides } from './useGuides';

const HOW: Record<'type' | 'ticket' | 'removed', string> = { type: 'by type', ticket: 'added', removed: 'removed' };

/** What the chip does when clicked, and how it says so. */
const actionOf = (row: TicketGuideRow, name: string) =>
  row.removed
    ? { change: { add: row.id }, label: `Put back ${name}`, mark: '+' }
    : { change: { remove: row.id }, label: `Remove ${name}`, mark: '×' };

/**
 * One of a ticket's guides: its name, whether the trail gives it to the type or it was added here, and (while the
 * ticket is open) the trail lead's remove, or put back for a type's guide taken off. Marked when agents can't use it.
 */
export function TicketGuideChip(props: {
  row: TicketGuideRow;
  editable: boolean;
  onChange: (change: { add: string } | { remove: string }) => void;
}) {
  const { view, find } = useGuides();
  const { row } = props;
  const r = find(row.id);
  const off = !!view && r?.status !== 'active';
  const name = r?.guide?.name ?? row.id;
  const kind = row.removed ? 'removed' : row.via;
  const tip = off ? `${name}: ${r?.reason ?? 'not installed'}` : (r?.guide?.summary ?? name);
  const { change, label, mark } = actionOf(row, name);
  return (
    <span
      className={cx('ticket-guide-chip', row.removed && 'removed', off && 'off')}
      data-guide-id={row.id}
      data-via={kind}
      title={tip}
    >
      <span className="name">{name}</span>
      <span className="how t-meta">{HOW[kind]}</span>
      {props.editable && (
        <button
          type="button"
          className="chip-act"
          aria-label={label}
          title={label}
          onClick={() => props.onChange(change)}
        >
          {mark}
        </button>
      )}
    </span>
  );
}
