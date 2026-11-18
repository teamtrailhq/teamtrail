import { GATE_MODES, type GateMode } from '@teamtrail/core';
import { cx } from '../../lib';
import { MODE_TEXT } from './gateText';

/** Off / Observe / Enforce for one gate: one click moves it, so Observe → Enforce is a single step. */
export function GateModeControl(props: {
  gate: string;
  label: string;
  value: GateMode;
  disabled: boolean;
  onChange: (mode: GateMode) => void;
}) {
  return (
    <div className="gate-modes" role="radiogroup" aria-label={`${props.label} mode`} data-gate={props.gate}>
      {GATE_MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={props.value === m}
          className={cx('gate-mode', props.value === m && 'on')}
          title={MODE_TEXT[m].tip}
          disabled={props.disabled}
          onClick={() => props.value !== m && props.onChange(m)}
        >
          {MODE_TEXT[m].label}
        </button>
      ))}
    </div>
  );
}
