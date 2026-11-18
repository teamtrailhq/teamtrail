import { attention } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { cx } from '../../lib';
import { TicketChips } from './TicketChips';
import type { TicketView } from './useTicketView';

/**
 * The top of a ticket, the same in its bubble and the full ticket: its title, its chips (key, type, state, agent and
 * model, proof, risk), and one quiet line for what it is to other tickets: whether a person takes it, what it reviews
 * and blocks. `titled: false` leaves the title out when the bubble's top already names the ticket.
 */
export function TicketHead({ v, titled = true, small }: { v: TicketView; titled?: boolean; small?: boolean }) {
  const { t, snap } = v;
  const keyOf = (id: string) => snap.tickets.find((x) => x.id === id)?.key ?? id;
  const blocks = snap.tickets.filter((x) => x.blockedBy.includes(t.id) && x.state === 'open').map((x) => x.key);
  // the state line says it while the ticket is ready ("Ready: needs a person")
  const hitl = attention(t) === 'hitl' && t.state === 'open' && !v.standing.title.includes('needs a person');
  return (
    <header className="ticket-head">
      {titled && <h3 className={cx('t-title ticket-title', small && 'small')}>{t.title}</h3>}
      <TicketChips chips={v.chips} />
      <MetaLine
        parts={[
          hitl && 'needs a person',
          t.reviewOf && `reviews ${keyOf(t.reviewOf)}`,
          blocks.length > 0 && `blocks ${blocks.join(', ')}`,
        ]}
      />
    </header>
  );
}
