import { NODE_W } from '@teamtrail/core';

const INSET = 8;

/** An agent at work: a thin bar along the card's top edge, filled to the step it's on (step 3 of 5: half of the third). */
export function StepBar({ step, total }: { step: number; total: number }) {
  const width = NODE_W - INSET * 2;
  const done = total > 0 ? Math.max(0, Math.min(1, (step - 0.5) / total)) : 0;
  return (
    <g className="step-bar" aria-hidden="true">
      <rect className="step-track" x={INSET} y={3} width={width} height={2.5} rx={1} />
      <rect className="step-fill" x={INSET} y={3} width={width * done} height={2.5} rx={1} />
    </g>
  );
}
