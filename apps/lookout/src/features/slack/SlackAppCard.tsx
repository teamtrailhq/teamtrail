import type { SlackStatus } from '@teamtrail/connector-slack';
import { Card, Pill } from '../../components/ui';
import { ConfirmConnect } from './ConfirmConnect';
import { DeliveryLine } from './DeliveryLine';
import { ScoutIntro } from './ScoutIntro';
import { SlackCardActions } from './SlackCardActions';
import { SlackStateLine } from './SlackStateLine';
import type { ConnectReturn } from './useConnectReturn';

/** Scout's card: where it's connected and its state, or how to add it, plus its actions. */
export function SlackAppCard(props: {
  s: SlackStatus;
  back: ConnectReturn;
  error?: string;
  onError: (message: string) => void;
  onChanged: (s: SlackStatus) => void;
  onToggle: () => void;
}) {
  const { s, back } = props;
  const confirming = !!back.confirm && !s.connected;
  return (
    <Card className={cardClass(s)}>
      <div className="card-row">
        <b className="choice-title t-row-title">Scout in Slack</b>
        {s.connected && <Pill className={s.enabled ? 'on' : ''}>{s.enabled ? 'On' : 'Off'}</Pill>}
      </div>
      {s.connected && <div className="c-loc">{workspaceLine(s)}</div>}
      {s.connected && <SlackStateLine s={s} />}
      {s.delivery && <DeliveryLine problem={s.delivery} />}
      {!s.connected && !confirming && <ScoutIntro s={s} connecting={back.busy} />}
      {confirming && <ConfirmConnect who={back.confirm!} onConnect={back.connect} onCancel={back.cancel} />}
      {props.error && <div className="test-line alert">✕ {props.error}</div>}
      {!confirming && (
        <SlackCardActions
          s={s}
          busy={back.busy}
          onError={props.onError}
          onChanged={props.onChanged}
          onToggle={props.onToggle}
        />
      )}
    </Card>
  );
}

function workspaceLine(s: SlackStatus) {
  const host = s.workspace?.url?.replace(/^https?:\/\/|\/$/g, '');
  return [s.workspace?.name, host].filter(Boolean).join(' · ');
}

/** Active while connected and on; open while not connected yet. */
function cardClass(s: SlackStatus) {
  const active = s.connected && s.enabled ? 'active' : '';
  const open = s.connected ? '' : 'open';
  return `connector ${active} ${open}`;
}
