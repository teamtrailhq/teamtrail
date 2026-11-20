import { cx } from '../../lib';
import { LabelLine } from './LabelLine';

/**
 * The inline confirmation after a change saves: a tick and a green label line (`SAVED · JOURNALED · 22:41`), shown
 * once `shown` and faded in. It keeps its place while hidden, so nothing shifts when it arrives.
 */
export function SavedNote(props: {
  shown: boolean;
  parts?: (string | false | null | undefined | '')[];
  className?: string;
}) {
  const parts = props.parts ?? ['Saved'];
  return (
    <span className={cx('ds-saved', props.shown && 'on', props.className)} role="status" aria-hidden={!props.shown}>
      <span className="ds-done-tick" aria-hidden="true" />
      <LabelLine parts={parts} tone="ok" />
    </span>
  );
}
