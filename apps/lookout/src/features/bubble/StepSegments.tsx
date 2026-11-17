import { cx } from '../../lib';

/** An agent's steps as short segments, the ones behind it filled: the bubble's bar, or a mini one in a list row. */
export function StepSegments(props: { step: number; total: number; mini?: boolean }) {
  const steps = Array.from({ length: Math.max(1, props.total) }, (_, i) => i + 1);
  return (
    <span
      className={cx('step-segments', props.mini && 'mini')}
      role="img"
      aria-label={`Step ${props.step} of ${props.total}`}
    >
      {steps.map((i) => (
        <span key={i} className={cx(i < props.step && 'done', i === props.step && 'now')} />
      ))}
    </span>
  );
}
