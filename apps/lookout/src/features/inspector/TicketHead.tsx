import { attention, type Ticket } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { TYPE_TEXT } from '../../lib';

/**
 * The top of the ticket inspector: its title, then one context line: key, type, whether a person or an agent takes
 * it, and the tickets it reviews or blocks.
 */
export function TicketHead({ t, tickets }: { t: Ticket; tickets: Ticket[] }) {
  const keyOf = (id: string) => tickets.find((x) => x.id === id)?.key ?? id;
  const blocks = tickets.filter((x) => x.blockedBy.includes(t.id)).map((x) => x.key);
  return (
    <header className="ticket-head">
      <h3 className="t-title">{t.title}</h3>
      <MetaLine
        parts={[
          { text: t.key, code: true },
          TYPE_TEXT[t.type],
          attention(t) === 'hitl' ? 'needs a person' : 'agent work',
          t.reviewOf && `reviews ${keyOf(t.reviewOf)}`,
          blocks.length > 0 && `blocks ${blocks.join(', ')}`,
        ]}
      />
    </header>
  );
}
