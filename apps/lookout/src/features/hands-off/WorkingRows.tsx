import { MetaLine, Row } from '../../components/ui';
import { shortModel } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';
import { StepSegments } from '../bubble';

/** One row per agent at work on the trail: the ticket, then the agent on its model and its step. */
export function WorkingRows(props: { working: LiveTicket[]; now: number; onTicket: (ticketId: string) => void }) {
  if (!props.working.length) return null;
  return (
    <ul className="home-rows">
      {props.working.map((l) => {
        const s = l.session;
        const model = shortModel(s?.model);
        const context = s
          ? [
              { text: s.agent, strong: true },
              model && `on ${model}`,
              `step ${s.step} of ${s.total}`,
              s.stepLabel.toLowerCase(),
            ]
          : [{ text: l.ticket.assignee ?? 'An agent', strong: true }, 'claimed, no live session'];
        return (
          <Row
            key={l.ticket.id}
            as="li"
            className="home-working"
            title={`${l.ticket.key} ${l.ticket.title}`}
            context={<MetaLine parts={context} />}
            trailing={s && <StepSegments step={s.step} total={s.total} mini />}
            onOpen={() => props.onTicket(l.ticket.id)}
          />
        );
      })}
    </ul>
  );
}
