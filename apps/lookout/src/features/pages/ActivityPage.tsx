import type { ActivityState, MapSnapshot, TicketLease, TrailDone } from '@teamtrail/core';
import { Panel, SectionHeader } from '../../components/ui';
import { isRunning } from '../../lib';
import { ActivityLog, Sessions, SessionsHead, StepTracker } from '../activity';
import { Conversation } from '../inbox';

/**
 * Activity, a page of its own: what the agents are doing (the latest step, every agent and claim), everything that
 * happened on the trail, and the conversation with an agent, opened from its row, a question or a ticket.
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
      <section className="page-col">
        <SectionHeader title="Agents" />
        <div className="zone-b">
          <StepTracker activity={activity} snap={props.snap} done={props.done} />
          <SessionsHead activity={activity} snap={props.snap} running={activity.sessions.filter(isRunning).length} />
          <Sessions
            snap={props.snap}
            activity={activity}
            leases={props.leases}
            onSelect={(s) => s?.kind === 'ticket' && props.onTicket(s.id)}
            onOpenChat={props.onOpenChat}
          />
        </div>
      </section>
      <section className="page-col">
        <SectionHeader
          title="Activity log"
          right={<span className="mono-label dim">{activity.feed.length} events</span>}
        />
        <div className="zone-b">
          <ActivityLog activity={activity} onTicket={props.onTicket} />
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
