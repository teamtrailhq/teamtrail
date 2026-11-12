import type { SlackStatus } from '@teamtrail/connector-slack';
import { Button } from '../../components/ui';
import { AddScout } from './AddScout';
import { ExtLink } from './ExtLink';
import { SlackRemove } from './SlackRemove';

/**
 * Scout's card's buttons: Add Scout to Slack before connecting (or again, once the service let it go), then Turn
 * off or on, Open Scout in Slack and Disconnect. Nothing while a connect is being confirmed.
 */
export function SlackCardActions(props: {
  s: SlackStatus;
  busy: boolean;
  onError: (message: string) => void;
  onChanged: (s: SlackStatus) => void;
  onToggle: () => void;
}) {
  const { s } = props;
  const lost = s.state === 'auth-error' || s.state === 'other-service';
  if (!s.connected)
    return (
      <div className="c-actions">
        {!props.busy && <AddScout again={s.legacy} onError={props.onError} />}
        {s.legacy && <SlackRemove onRemoved={props.onChanged} />}
      </div>
    );
  return (
    <div className="c-actions">
      {lost ? (
        <AddScout again onError={props.onError} />
      ) : (
        <Button size="sm" on={s.enabled} onClick={props.onToggle}>
          {s.enabled ? 'Turn off' : 'Turn on'}
        </Button>
      )}
      {s.links.homeWeb && (
        <ExtLink small href={s.links.homeWeb}>
          Open Scout in Slack
        </ExtLink>
      )}
      <SlackRemove onRemoved={props.onChanged} />
    </div>
  );
}
