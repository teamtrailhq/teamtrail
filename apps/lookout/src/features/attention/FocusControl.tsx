import type { AttentionView, FocusChange } from '@teamtrail/core';
import { Button, InfoTip, MetaLine } from '../../components/ui';
import { cx } from '../../lib';
import { HeaderMenu } from '../header';
import { focusActions } from './focusActions';
import { focusCopy } from './focusCopy';

const FOCUS_TIP =
  'Focus holds back interruptions: no browser notifications or Slack messages, even for urgent items. ' +
  'Nothing is answered or dropped: everything still waits in Waiting on you and the Slack digest. ' +
  'Quiet hours turn it on every day; you can also focus for a while or end it early. This stays on this machine.';

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
      <span className="focus-label">{copy.label}</span>
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
    <HeaderMenu className="focus-menu" label={label} role="dialog" tip={copy.title}>
      {(close) => (
        <div className="focus-panel" aria-label="Focus">
          <div className="focus-panel-head">
            <span className="t-row-title">{copy.title}</span>
            <InfoTip text={FOCUS_TIP} />
          </div>
          <MetaLine parts={[copy.reason]} />
          <MetaLine className="focus-held" parts={[copy.detail]} />
          <div className="focus-panel-actions">
            {focusActions(view.focus).map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={a.primary ? 'primary' : 'default'}
                onClick={() => {
                  close();
                  props.onChange(a.change);
                }}
              >
                {a.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                close();
                props.onSettings();
              }}
            >
              Quiet hours
            </Button>
          </div>
        </div>
      )}
    </HeaderMenu>
  );
}
