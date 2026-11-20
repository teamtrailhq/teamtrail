import type { ElementType, ReactNode } from 'react';
import { cx } from '../../lib';

/** The status edge: red only for "needs you now", amber for work held up or at risk, neutral otherwise. */
export type EdgeTone = 'urgent' | 'attention' | 'neutral';

/**
 * A list row with the three levels of the presenting-data rules: a title (what it is, at most two lines), one
 * context line, and an optional detail line, with a status edge on the left and a trailing slot (time) on the
 * right. `actions` show on hover or keyboard focus (always on touch screens), in place of the trailing slot. `below` sits under the
 * row (an inline action). `label` puts the scenes' label line above the title and `action` one action always on the
 * right, the scenes' row shape. The main area is a button when `onOpen` is set, so the row opens with one click.
 */
export function Row(props: {
  as?: ElementType;
  className?: string;
  edge?: EdgeTone;
  selected?: boolean;
  /** Marks the row that opens the page on screen (`aria-current`), as in a side nav. */
  current?: 'page' | 'true';
  /** The scenes' label line above the title (a `LabelLine`): what it is, whose, how long ago. */
  label?: ReactNode;
  title: ReactNode;
  /** Full title for the tooltip when it's clamped. */
  titleText?: string;
  context?: ReactNode;
  detail?: ReactNode;
  /** Full detail for the tooltip when it's cut. */
  detailText?: string;
  trailing?: ReactNode;
  actions?: ReactNode;
  /** The row's one action, always shown on its right (unlike `actions`, which show on hover). */
  action?: ReactNode;
  below?: ReactNode;
  onOpen?: () => void;
}) {
  const { as: Root = 'div', edge = 'neutral' } = props;
  const Main = props.onOpen ? 'button' : 'div';
  return (
    <Root
      className={cx('ds-row', `edge-${edge}`, !!props.action && 'has-action', props.selected && 'on', props.className)}
    >
      <Main
        className="ds-row-main"
        {...(props.onOpen ? { type: 'button', onClick: props.onOpen } : {})}
        title={props.titleText}
        aria-current={props.current}
      >
        {props.label && <span className="ds-row-label">{props.label}</span>}
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
      {props.action && <span className="ds-row-action">{props.action}</span>}
      {props.actions && <span className="ds-row-actions">{props.actions}</span>}
      {props.below && <div className="ds-row-below">{props.below}</div>}
    </Root>
  );
}
