import type { AttentionView, FocusChange } from '@teamtrail/core';
import { Button, InfoTip, MetaLine } from '../../components/ui';
import { focusActions } from './focusActions';
import { focusCopy } from './focusCopy';

const FOCUS_TIP =
  'Focus holds back interruptions: no browser notifications or Slack messages, even for urgent items. ' +
  'Nothing is answered or dropped: everything still waits in Waiting on you and the Slack digest. ' +
  'Quiet hours turn it on every day; you can also focus for a while or end it early. This stays on this machine.';

/**
 * What focus holds back and the ways to change it: in the header's focus control, and on a phone at the top of the
 * header's More menu. `close` closes the menu it is in after a choice.
 */
export function FocusPanel(props: {
  view: AttentionView;
  onChange: (change: FocusChange) => void;
  onSettings: () => void;
  close: () => void;
}) {
  const copy = focusCopy(props.view);
  return (
    <div className="focus-panel" aria-label="Focus">
      <div className="focus-panel-head">
        <span className="t-row-title">{copy.title}</span>
        <InfoTip text={FOCUS_TIP} />
      </div>
      <MetaLine parts={[copy.reason]} />
      <MetaLine className="focus-held" parts={[copy.detail]} />
      <div className="focus-panel-actions">
        {focusActions(props.view.focus).map((a) => (
          <Button
            key={a.label}
            size="sm"
            variant={a.primary ? 'primary' : 'default'}
            onClick={() => {
              props.close();
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
            props.close();
            props.onSettings();
          }}
        >
          Quiet hours
        </Button>
      </div>
    </div>
  );
}
