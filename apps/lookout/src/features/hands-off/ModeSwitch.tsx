import { type LookoutMode, LOOKOUT_MODES } from '@teamtrail/core';
import { cx } from '../../lib';

const LABEL: Record<LookoutMode, string> = { 'hands-off': 'Hands-off', 'hands-on': 'Hands-on' };
const TIP: Record<LookoutMode, string> = {
  'hands-off': 'Only what needs you, progress and what happened while you were away',
  'hands-on': 'The map and every view',
};

/**
 * Hands-off or Hands-on, for this person: in the header and in Settings → You. It changes what the Lookout shows
 * them, never what agents may decide or how work is verified.
 */
export function ModeSwitch(props: { mode: LookoutMode; onChange: (mode: LookoutMode) => void; className?: string }) {
  return (
    <div role="group" aria-label="Mode" className={cx('mode-switch', props.className)}>
      {LOOKOUT_MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={cx('mode-switch-btn', props.mode === m && 'on')}
          aria-pressed={props.mode === m}
          data-tip={TIP[m]}
          onClick={() => props.onChange(m)}
        >
          {LABEL[m]}
        </button>
      ))}
    </div>
  );
}
