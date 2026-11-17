import type { SessionInfo } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { shortModel } from '../../lib';
import { StepSegments } from './StepSegments';

/** The agent at work on the ticket: its name, its model (the full id on hover), its step and the step's name. */
export function AgentLine({ session: s }: { session: SessionInfo }) {
  const model = shortModel(s.model);
  return (
    <div className="bubble-agent">
      <MetaLine
        parts={[
          { text: s.agent, strong: true },
          model && { text: model, tip: s.model, className: 'agent-model' },
          `step ${s.step} of ${s.total}`,
          s.stepLabel.toLowerCase(),
        ]}
      />
      <StepSegments step={s.step} total={s.total} />
    </div>
  );
}
