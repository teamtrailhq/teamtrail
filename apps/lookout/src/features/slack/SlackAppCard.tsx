import type { SlackStatus } from '@teamtrail/connector-slack';
import { Card, Pill, Button } from '../../components/ui';
import { SlackRemove } from './SlackRemove';
import { SlackStateLine } from './SlackStateLine';

/** The Scout app card: where it's connected and its state, or an invitation to connect, plus its actions. */
export function SlackAppCard(props: {
  s: SlackStatus;
  setup: boolean;
  onSetup: (open: boolean) => void;
  onRemoved: (s: SlackStatus) => void;
  onToggle: () => void;
}) {
  const { s, setup } = props;
  const connected = s.step === 'done';
  return (
    <Card className={cardClass(s, setup)}>
      <div className="card-row">
        <b className="choice-title t-row-title">Your Scout app</b>
        {connected && <Pill className={s.enabled ? 'on' : ''}>{s.enabled ? 'On' : 'Off'}</Pill>}
      </div>
      {connected && <div className="c-loc">{workspaceLine(s)}</div>}
      {connected && <SlackStateLine s={s} />}
      {!connected && s.step === 1 && !setup && (
        <p className="sl-lead">
          Answer agents and save threads as decisions from Slack. You create your own Scout app in your workspace; it
          runs from this machine and its tokens stay in your local credential store.
        </p>
      )}
      <div className="c-actions">
        {!connected && !setup && (
          <Button size="sm" variant="primary" onClick={() => props.onSetup(true)}>
            {s.step === 1 ? 'Connect' : `Resume at step ${s.step}`}
          </Button>
        )}
        {connected && (
          <Button size="sm" on={s.enabled} onClick={props.onToggle}>
            {s.enabled ? 'Turn off' : 'Turn on'}
          </Button>
        )}
        {connected && s.state === 'auth-error' && (
          <Button size="sm" variant="primary" onClick={() => props.onSetup(true)}>
            Reconnect
          </Button>
        )}
        {s.step !== 1 && <SlackRemove onRemoved={props.onRemoved} />}
      </div>
    </Card>
  );
}

function workspaceLine(s: SlackStatus) {
  const host = s.workspace?.url?.replace(/^https?:\/\/|\/$/g, '');
  return [s.workspace?.name, host, s.setup.appId].filter(Boolean).join(' · ');
}

/** Active while connected and on; open while setting up or not connected yet. */
function cardClass(s: SlackStatus, setup: boolean) {
  const connected = s.step === 'done';
  const active = connected && s.enabled ? 'active' : '';
  const open = setup || !connected ? 'open' : '';
  return `connector ${active} ${open}`;
}
