import { LabelLine, Row } from '../../components/ui';
import { shortModel } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';

/**
 * One row per agent at work on the trail: the agent, its model, the ticket and its step in a label line ending in the
 * blaze cursor, then the ticket's title.
 */
export function WorkingRows(props: { working: LiveTicket[]; now: number; onTicket: (ticketId: string) => void }) {
  if (!props.working.length) return null;
  return (
    <ul className="home-rows">
      {props.working.map((l) => {
        const s = l.session;
        const label = s
          ? [s.agent, shortModel(s.model), l.ticket.key, `step ${s.step} of ${s.total}`]
          : [l.ticket.assignee ?? 'An agent', l.ticket.key, 'claimed, no live session'];
        return (
          <Row
            key={l.ticket.id}
            as="li"
            className="home-working"
            label={<LabelLine parts={label} cursor={!!s} />}
            title={l.ticket.title}
            titleText={s ? `${l.ticket.key} ${l.ticket.title}: ${s.stepLabel}` : undefined}
            onOpen={() => props.onTicket(l.ticket.id)}
          />
        );
      })}
    </ul>
  );
}
