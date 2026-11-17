import { Button, Empty, MetaLine, Row, SectionHeader } from '../../components/ui';
import { ago, shortModel } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';
import { StepSegments } from '../bubble';

/**
 * The agents on the trail now, one row each: the ticket, then the agent, its model, its step and how long it's
 * been on it, with a mini step bar. A claim with no live session says so. The row opens the ticket's bubble; Chat
 * opens the conversation.
 */
export function AgentsAtWork(props: {
  working: LiveTicket[];
  now: number;
  onTicket: (ticketId: string) => void;
  onOpenChat: (sessionId: string) => void;
}) {
  return (
    <section className="panel trail-list agents-list">
      <SectionHeader title="Agents at work" count={<span className="n mono-label">{props.working.length}</span>} />
      {props.working.length === 0 && <Empty>No agent is on this trail now</Empty>}
      <ul className="trail-list-rows">
        {props.working.map((l) => {
          const s = l.session;
          const model = shortModel(s?.model);
          const context = s
            ? [
                { text: s.agent, strong: true },
                model && { text: model, tip: s.model },
                `step ${s.step} of ${s.total}`,
                s.stepLabel.toLowerCase(),
                ago(props.now - s.startedAt),
              ]
            : [{ text: l.ticket.assignee ?? 'An agent', strong: true }, 'claimed, no live session'];
          return (
            <Row
              key={l.ticket.id}
              as="li"
              className="agent-row"
              title={`${l.ticket.key} ${l.ticket.title}`}
              context={<MetaLine parts={context} />}
              trailing={s && <StepSegments step={s.step} total={s.total} mini />}
              onOpen={() => props.onTicket(l.ticket.id)}
              actions={
                s && (
                  <Button size="sm" onClick={() => props.onOpenChat(s.id)}>
                    Chat
                  </Button>
                )
              }
            />
          );
        })}
      </ul>
    </section>
  );
}
