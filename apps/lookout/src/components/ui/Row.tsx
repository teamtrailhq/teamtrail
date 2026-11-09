import type { ElementType, ReactNode } from 'react';
import { cx } from '../../lib';

/** The status edge: red only for "needs you now", amber for work held up or at risk, neutral otherwise. */
export type EdgeTone = 'urgent' | 'attention' | 'neutral';

/**
 * A list row with the three levels of the presenting-data rules: a title (what it is, at most two lines), one
 * context line, and an optional detail line, with a status edge on the left and a trailing slot (time) on the
 * right. `actions` show on hover or keyboard focus (always on touch screens), in place of the trailing slot. `below` sits under the
 * row (an inline action). The main area is a button when `onOpen` is set, so the row opens with one click.
 */
export function Row(props: {
  as?: ElementType;
  className?: string;
  edge?: EdgeTone;
  selected?: boolean;
  /** Marks the row that opens the page on screen (`aria-current`), as in a side nav. */
  current?: 'page' | 'true';
  title: ReactNode;
  /** Full title for the tooltip when it's clamped. */
  titleText?: string;
  context?: ReactNode;
  detail?: ReactNode;
  /** Full detail for the tooltip when it's cut. */
  detailText?: string;
  trailing?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  onOpen?: () => void;
}) {
  const { as: Root = 'div', edge = 'neutral' } = props;
  const Main = props.onOpen ? 'button' : 'div';
  return (
    <Root className={cx('ds-row', `edge-${edge}`, props.selected && 'on', props.className)}>
      <Main
        className="ds-row-main"
        {...(props.onOpen ? { type: 'button', onClick: props.onOpen } : {})}
        title={props.titleText}
        aria-current={props.current}
      >
        <span className="ds-row-top">
          <span className="ds-row-title t-row-title">{props.title}</span>
          {props.trailing && <span className="ds-row-trail t-meta">{props.trailing}</span>}
        </span>
        {props.context && <span className="ds-row-context">{props.context}</span>}
        {props.detail && (
          <span className="ds-row-detail t-meta" title={props.detailText}>
            {props.detail}
          </span>
        )}
      </Main>
      {props.actions && <span className="ds-row-actions">{props.actions}</span>}
      {props.below && <div className="ds-row-below">{props.below}</div>}
    </Root>
  );
}
