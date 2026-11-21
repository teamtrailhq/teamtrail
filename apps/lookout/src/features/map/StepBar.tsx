import { NODE_W } from '@teamtrail/core';
import { stepStates } from '../../lib/stepStates';
import { CARD_STEPS_Y, CARD_TEXT_X } from './cardLayout';

const GAP = 2;

/** An agent at work: a thin step track along the card's foot, a segment per step (passed, the one it's on, ahead). */
export function StepBar({ step, total }: { step: number; total: number }) {
  const states = stepStates({ step, total });
  if (!states.length) return null;
  const width = NODE_W - CARD_TEXT_X * 2;
  const seg = (width - GAP * (states.length - 1)) / states.length;
  return (
    <g className="step-bar" aria-hidden="true">
      {states.map((s, i) => (
        <rect
          key={i}
          className={`step-${s}`}
          x={CARD_TEXT_X + i * (seg + GAP)}
          y={CARD_STEPS_Y}
          width={seg}
          height={2}
        />
      ))}
    </g>
  );
}
