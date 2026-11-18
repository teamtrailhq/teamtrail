import type { AttentionView, FocusChange } from '@teamtrail/core';
import { cx } from '../../lib';
import { HeaderMenu } from '../header';
import { focusCopy } from './focusCopy';
import { FocusPanel } from './FocusPanel';

/**
 * The header's focus state, always visible: "Focus on · until 12:00", "Focus paused · until 09:00" or "Focus off".
 * A click opens what it holds back and the ways to change it.
 */
export function FocusControl(props: {
  view: AttentionView;
  onChange: (change: FocusChange) => void;
  onSettings: () => void;
}) {
  const { view } = props;
  const copy = focusCopy(view);
  const state = view.focus.kind;
  const label = (
    <span className={cx('focus-state', `focus-${state}`)}>
      <i className="focus-dot" aria-hidden="true" />
      <span className="focus-label">
        Focus<span className="focus-word"> {copy.word}</span>
      </span>
      {copy.until && (
        <span className="focus-until">
          <span className="sep"> · </span>
          <span className="focus-until-word">until </span>
          {copy.until}
        </span>
      )}
    </span>
  );
  return (
    <HeaderMenu className="focus-menu" label={label} role="dialog" tip={copy.title} ariaLabel={copy.title}>
      {(close) => <FocusPanel view={view} onChange={props.onChange} onSettings={props.onSettings} close={close} />}
    </HeaderMenu>
  );
}
