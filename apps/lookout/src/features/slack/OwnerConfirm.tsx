import type { SlackStatus, SlackUser } from '@teamtrail/connector-slack';
import { useState } from 'react';
import { Button, Meta } from '../../components/ui';
import { slackApi } from './slackApi';

/** What Slack's email says about the account: a hint only, never a reason on its own. */
const EMAIL_HINT: Record<'true' | 'false', string> = {
  true: 'Its Slack email is your git email',
  false: 'Its Slack email is not your git email',
};

/**
 * The Slack account that entered the code shown on this machine, for the trail lead to recognise and confirm. The
 * handle and the workspace lead, because a display name can be set to anyone's. Until the lead confirms, Scout
 * sends nothing in Slack and takes nothing from it.
 */
export function OwnerConfirm(props: { s: SlackStatus; who: SlackUser; set: (s: SlackStatus) => void }) {
  const { s, who, set } = props;
  const [error, setError] = useState<string>();
  const fail = (e: Error) => setError(e.message);
  const handle = who.name ? `@${who.name}` : who.id;
  const host = s.workspace?.url?.replace(/^https?:\/\/|\/$/g, '');
  const hint = who.gitEmail === undefined ? undefined : EMAIL_HINT[`${who.gitEmail}`];
  return (
    <>
      <p>
        A Slack account entered your code. Check that this is the account you just typed the code into, in your
        workspace.
      </p>
      <div className="sl-who">
        <b className="t-row-title">{handle}</b>
        <Meta parts={[who.realName, s.workspace?.name, host]} />
        <Meta className="dim" parts={[<code key="id">{who.id}</code>, hint]} />
      </div>
      <div className="sl-actions">
        <Button variant="primary" onClick={() => void slackApi.confirmOwner(who.id).then(set, fail)}>
          Yes, this is me
        </Button>
        <Button onClick={() => void slackApi.resetOwner().then(set, fail)}>Not me</Button>
      </div>
      {error && <div className="test-line alert">✕ {error}</div>}
      <Meta className="dim" parts={['Nothing is sent in Slack until you confirm']} />
    </>
  );
}
