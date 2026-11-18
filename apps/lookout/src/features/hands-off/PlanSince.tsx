import { Button, MetaLine, Row } from '../../components/ui';
import type { SinceRow } from './sinceRows';

const plural = (n: number) => (n === 1 ? 'ticket' : 'tickets');

/** The plan changed while you were away: tickets ruled out, or added after it was charted, and the first of them. */
export function PlanSince(props: {
  row: Extract<SinceRow, { kind: 'ruled-out' | 'added' }>;
  onTicket: (ticketId: string) => void;
}) {
  const { tickets } = props.row;
  const n = tickets.length;
  const what = props.row.kind === 'ruled-out' ? `${n} ${plural(n)} ruled out` : `${n} ${plural(n)} added`;
  const first = tickets[0];
  return (
    <Row
      as="li"
      className="home-since-row"
      title={
        <>
          <span className="since-icon" aria-hidden="true">
            ↺
          </span>{' '}
          The plan changed: {what}
        </>
      }
      context={<MetaLine parts={tickets.slice(0, 4).map((t) => `${t.key} ${t.title}`)} />}
      onOpen={() => props.onTicket(first.id)}
      actions={
        <Button size="sm" onClick={() => props.onTicket(first.id)}>
          See change
        </Button>
      }
    />
  );
}
