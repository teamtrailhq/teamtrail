import { cx } from '../../lib';
import { stepStates } from '../../lib/stepStates';

/**
 * The thin step track: one hairline segment per step, the passed ones blaze, the one being worked on half lit, the
 * rest the line colour. `waiting` dims the current step (the agent waits on you or on something else). Filling a step
 * animates (`--dur-fill`). The map card's own SVG bar is features/map/StepBar.tsx.
 */
export function StepTrack(props: { step: number; total: number; waiting?: boolean; className?: string }) {
  const states = stepStates(props);
  if (!states.length) return null;
  const at = Math.min(Math.max(props.step, 0), states.length);
  return (
    <span
      className={cx('ds-steps', props.waiting && 'waiting', props.className)}
      role="img"
      aria-label={`Step ${at} of ${states.length}`}
    >
      {states.map((s, i) => (
        <i key={i} className={s} />
      ))}
    </span>
  );
}
