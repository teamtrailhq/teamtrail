import { SectionHeader } from '../../components/ui';
import { isRunning } from '../../lib';
import { ActivityLog } from './ActivityLog';
import { Sessions } from './Sessions';
import { SessionsHead } from './SessionsHead';
import { StepTracker } from './StepTracker';
import type { ZoneProps } from './types';

/** Laptop tab / phone view: step, sessions and log stacked. */
export function ActivityStack(props: ZoneProps) {
  return (
    <div className="zone-b activity-stack">
      <StepTracker activity={props.activity} snap={props.snap} done={props.done} />
      <SessionsHead
        activity={props.activity}
        snap={props.snap}
        running={props.activity.sessions.filter(isRunning).length}
      />
      <Sessions
        snap={props.snap}
        activity={props.activity}
        leases={props.leases}
        onSelect={(s) => s?.kind === 'ticket' && props.onTicket(s.id)}
        onOpenChat={props.onOpenChat}
      />
      <SectionHeader sub title="Activity log" />
      <ActivityLog activity={props.activity} onTicket={props.onTicket} />
    </div>
  );
}
