import type { ActivityState, MapSnapshot, TicketLease, TrailDone } from '@teamtrail/core';
import { Panel } from '../../components/ui';
import { isRunning } from '../../lib';
import { ActivityAgents, SessionsHead } from '../activity';
import { Conversation } from '../inbox';

/**
 * Activity, a page of its own: one lane per agent at work (its claims, questions, answers, submissions and how
 * verification came back, and what it is on now), and the conversation with an agent, opened from its lane, a
 * question or a ticket. Milestones only: no raw log of every step.
 */
export function ActivityPage(props: {
  activity: ActivityState;
  /** Every session, for the conversation (it may be on another trail). */
  allActivity: ActivityState;
  snaps: Record<string, MapSnapshot>;
  snap?: MapSnapshot;
  leases?: TicketLease[];
  done?: TrailDone;
  chatSession?: string;
  onTicket: (id: string) => void;
  onOpenChat: (sessionId: string) => void;
  onAnswer: (questionId: string, text: string) => void;
}) {
  const { activity } = props;
  return (
    <Panel className="zone page activity-page">
      <section className="page-col lanes-col">
        <SessionsHead activity={activity} snap={props.snap} running={activity.sessions.filter(isRunning).length} />
        <div className="zone-b">
          <ActivityAgents
            activity={activity}
            snap={props.snap}
            leases={props.leases}
            done={props.done}
            onSelect={(s) => s?.kind === 'ticket' && props.onTicket(s.id)}
            onOpenChat={props.onOpenChat}
          />
        </div>
      </section>
      <section className="page-col conversation-col">
        <Conversation
          activity={props.allActivity}
          snaps={props.snaps}
          sessionId={props.chatSession}
          onAnswer={props.onAnswer}
        />
      </section>
    </Panel>
  );
}
