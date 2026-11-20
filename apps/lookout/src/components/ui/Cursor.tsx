import { cx } from '../../lib';

/**
 * The blaze block cursor: an agent at work, or where you are. Sized to the text it sits in. It blinks unless `still`,
 * and never under reduced motion. Decorative; say what it means in the text beside it (`label` gives it a name when
 * it stands alone).
 */
export function Cursor(props: { still?: boolean; label?: string; className?: string }) {
  return (
    <span
      className={cx('ds-cursor', !props.still && 'blink', props.className)}
      {...(props.label ? { role: 'img', 'aria-label': props.label } : { 'aria-hidden': true })}
    />
  );
}
