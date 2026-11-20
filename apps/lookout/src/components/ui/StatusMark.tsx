import { cx } from '../../lib';

/**
 * The square status mark, 16px: `done` a tick, `verified` a green tick, `now` a blaze square (being worked on),
 * `todo` an empty square, `number` the step's number, `rework` a dashed square, `held` a rose bar (held for you).
 * Decorative by default: say the state in text beside it, or give it a `label`.
 */
export type StatusMarkKind = 'done' | 'verified' | 'now' | 'todo' | 'number' | 'rework' | 'held';

export function StatusMark(props: { kind: StatusMarkKind; n?: number; label?: string; className?: string }) {
  return (
    <span
      className={cx('ds-mark', `mark-${props.kind}`, props.className)}
      {...(props.label ? { role: 'img', 'aria-label': props.label } : { 'aria-hidden': true })}
    >
      {props.kind === 'number' ? props.n : null}
    </span>
  );
}
