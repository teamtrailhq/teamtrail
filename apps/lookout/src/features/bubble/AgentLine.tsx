import type { SessionInfo } from '@teamtrail/core';
import { LabelLine, StepTrack } from '../../components/ui';

/**
 * Where the agent at work on the ticket is: its step and the step's name in mono, over the thin step track. Its name
 * and model are in the bar. `waiting`: the step waits on you, so it is only partly lit and the cursor rests.
 */
export function AgentLine({ session: s, waiting }: { session: SessionInfo; waiting?: boolean }) {
  return (
    <div className="bubble-agent">
      <LabelLine
        parts={[`step ${s.step} of ${s.total}`, s.stepLabel.toLowerCase()]}
        tone={waiting ? 'plain' : 'agent'}
        cursor={!waiting}
      />
      <StepTrack step={s.step} total={s.total} waiting={waiting} />
    </div>
  );
}
