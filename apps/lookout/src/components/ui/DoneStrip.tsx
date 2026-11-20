import type { ReactNode } from 'react';
import { cx } from '../../lib';
import { LabelLine } from './LabelLine';

/**
 * The green strip that takes the place of what was just settled (`Answered · D-21 · Alex Rivera`): a tick and the
 * label line, then what was decided as one line of text and an optional quiet `meta` line. It arrives with the
 * `ds-arrive` motion; nothing moves under reduced motion.
 */
export function DoneStrip(props: {
  label: (string | false | null | undefined | '')[];
  children?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('ds-done', 'ds-arrive', props.className)} role="status">
      <LabelLine parts={props.label} tone="ok" className="ds-done-label">
        <span className="ds-done-tick" aria-hidden="true" />
      </LabelLine>
      {props.children && <p className="ds-done-text">{props.children}</p>}
      {props.meta && <span className="ds-done-meta t-meta">{props.meta}</span>}
    </div>
  );
}
