import type { MapSnapshot, SessionInfo } from '@teamtrail/core';
import { LabelLine, Row, SceneCard } from '../../components/ui';
import { shortModel } from '../../lib';

/**
 * What each agent is on right now: agent · model · ticket · step on the label line, blaze with the cursor while it
 * works, rose when it waits on your answer; the ticket's title under it.
 */
export function GlanceAgents(props: { snap: MapSnapshot; agents: SessionInfo[]; onTicket: (id: string) => void }) {
  const keyed = new Map(props.snap.tickets.map((t) => [t.id, t]));
  return (
    <SceneCard
      className="glance-card glance-agents"
      label={<LabelLine parts={['Agents', String(props.agents.length)]} tone="dim" />}
    >
      <ul className="row-list">
        {props.agents.map((s) => {
          const ticket = keyed.get(s.ticketId!);
          const waits = !!s.waitingOn;
          return (
            <Row
              key={s.id}
              as="li"
              edge={waits ? 'urgent' : 'neutral'}
              label={
                <LabelLine
                  parts={[
                    s.agent,
                    shortModel(s.model),
                    ticket?.key,
                    waits ? 'waits on you' : `${s.stepLabel}, step ${s.step} of ${s.total}`,
                  ]}
                  tone={waits ? 'urgent' : 'agent'}
                  cursor={!waits}
                />
              }
              title={ticket?.title ?? s.stepLabel}
              onOpen={() => props.onTicket(s.ticketId!)}
            />
          );
        })}
      </ul>
    </SceneCard>
  );
}
