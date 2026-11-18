import type { SessionInfo } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { StepSegments } from './StepSegments';

/** Where the agent at work on the ticket is: its step and the step's name. Its name and model are in the chips. */
export function AgentLine({ session: s }: { session: SessionInfo }) {
  return (
    <div className="bubble-agent">
      <MetaLine parts={[`step ${s.step} of ${s.total}`, s.stepLabel.toLowerCase()]} />
      <StepSegments step={s.step} total={s.total} />
    </div>
  );
}
