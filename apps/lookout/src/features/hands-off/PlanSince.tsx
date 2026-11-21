import { LabelLine, Row } from '../../components/ui';
import type { SinceRow } from './sinceRows';

/**
 * The plan changed while you were away: PLAN CHANGED with how many tickets were added or ruled out, the first of them
 * as the title and the rest in one line; the row opens the first.
 */
export function PlanSince(props: {
  row: Extract<SinceRow, { kind: 'ruled-out' | 'added' }>;
  onTicket: (ticketId: string) => void;
}) {
  const { tickets } = props.row;
  const [first, ...rest] = tickets;
  const added = props.row.kind === 'added';
  const what =
    tickets.length === 1
      ? `${first.key} ${added ? 'added' : 'ruled out'}`
      : `${tickets.length} ${added ? 'added' : 'ruled out'}`;
  const more = rest.slice(0, 4).map((t) => `${t.key} ${t.title}`);
  return (
    <Row
      as="li"
      className="home-since-row"
      label={<LabelLine parts={['Plan changed', what]} />}
      title={`${added ? 'Added' : 'Ruled out'}: ${first.title}`}
      detail={more.length > 0 && `Also ${more.join(' · ')}`}
      onOpen={() => props.onTicket(first.id)}
    />
  );
}
