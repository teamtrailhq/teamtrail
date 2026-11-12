import type { SlackConnectPreview } from '@teamtrail/connector-slack';
import { Button } from '../../components/ui';

/** "Connect as @user in <workspace>?": the trail lead sees whose Slack account this is before anything is saved. */
export function ConfirmConnect(props: { who: SlackConnectPreview; onConnect: () => void; onCancel: () => void }) {
  const { who } = props;
  return (
    <>
      <p className="sl-lead">
        Connect as <b>@{who.user.name ?? who.user.id}</b> in <b>{who.workspace.name}</b>? That Slack account becomes
        Scout's owner for this Teamtrail: questions and approvals reach it.
      </p>
      <div className="c-actions">
        <Button size="sm" variant="primary" onClick={props.onConnect}>
          Connect
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}
