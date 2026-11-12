import type { SlackStatus } from '@teamtrail/connector-slack';
import { Card, Pill, Button } from '../../components/ui';
import { AddScout } from './AddScout';
import { DeliveryLine } from './DeliveryLine';
import { ExtLink } from './ExtLink';
import { ScoutIntro } from './ScoutIntro';
import { SlackRemove } from './SlackRemove';
import { SlackStateLine } from './SlackStateLine';

/** Scout's card: where it's connected and its state, or how to add it, plus its actions. */
export function SlackAppCard(props: {
  s: SlackStatus;
  connecting: boolean;
  error?: string;
  onError: (message: string) => void;
  onChanged: (s: SlackStatus) => void;
  onToggle: () => void;
}) {
  const { s } = props;
  return (
    <Card className={cardClass(s)}>
      <div className="card-row">
        <b className="choice-title t-row-title">Scout in Slack</b>
        {s.connected && <Pill className={s.enabled ? 'on' : ''}>{s.enabled ? 'On' : 'Off'}</Pill>}
      </div>
      {s.connected && <div className="c-loc">{workspaceLine(s)}</div>}
      {s.connected && <SlackStateLine s={s} />}
      {s.delivery && <DeliveryLine problem={s.delivery} />}
      {!s.connected && <ScoutIntro s={s} connecting={props.connecting} />}
      {props.error && <div className="test-line alert">✕ {props.error}</div>}
      <div className="c-actions">
        {!s.connected && !props.connecting && <AddScout again={s.legacy} onError={props.onError} />}
        {s.connected && s.state !== 'auth-error' && (
          <Button size="sm" on={s.enabled} onClick={props.onToggle}>
            {s.enabled ? 'Turn off' : 'Turn on'}
          </Button>
        )}
        {s.connected && s.state === 'auth-error' && <AddScout again onError={props.onError} />}
        {s.connected && s.links.homeWeb && (
          <ExtLink small href={s.links.homeWeb}>
            Open Scout in Slack
          </ExtLink>
        )}
        {(s.connected || s.legacy) && <SlackRemove onRemoved={props.onChanged} />}
      </div>
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
