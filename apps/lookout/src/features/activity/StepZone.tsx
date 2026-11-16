import { Panel, SectionHeader } from '../../components/ui';
import { isRunning } from '../../lib';
import { Sessions } from './Sessions';
import { SessionsHead } from './SessionsHead';
import { StepTracker } from './StepTracker';
import type { ZoneProps } from './types';

/** Wide: current step + sessions in one fixed zone. */
export function StepZone(props: ZoneProps) {
  const running = props.activity.sessions.filter(isRunning).length;
  // Nobody working and nothing claimed: the step tracker's empty state says it all.
  const idle = !props.activity.sessions.length && !props.snap?.tickets.some((t) => t.state === 'open' && t.assignee);
  return (
    <Panel className="zone step-zone" style={{ gridArea: 'step' }}>
      <SectionHeader
        className="zone-title"
        icon="tent"
        title="Current trail step"
        info="What your agents are doing right now. The top shows the latest step an agent reported; below is every agent holding a ticket."
      />
      <div className="zone-b">
        <StepTracker activity={props.activity} snap={props.snap} done={props.done} />
        {!idle && (
          <>
            <SessionsHead activity={props.activity} snap={props.snap} running={running} usage={false} />
            <Sessions
              snap={props.snap}
              activity={props.activity}
              leases={props.leases}
              onSelect={(s) => s?.kind === 'ticket' && props.onTicket(s.id)}
              onOpenChat={props.onOpenChat}
            />
          </>
        )}
      </div>
    </Panel>
  );
}
