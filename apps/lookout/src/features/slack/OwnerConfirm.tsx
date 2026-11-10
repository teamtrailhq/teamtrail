import type { SlackStatus, SlackUser } from '@teamtrail/connector-slack';
import { useState } from 'react';
import { Button, Meta } from '../../components/ui';
import { slackApi } from './slackApi';

/** How the account came to be put forward, as the question the trail lead answers. */
const ASKS: Record<NonNullable<SlackUser['via']>, string> = {
  code: 'This Slack account entered your code. Is it yours?',
  'git-email': 'Your git email belongs to this Slack account. Is it yours?',
  home: 'This Slack account clicked “This is me” in Slack, in an earlier version. Confirm once that it is yours.',
};

/**
 * The Slack account put forward as the owner, for the trail lead to recognise and confirm on this machine. Until
 * they do, Scout sends nothing in Slack and takes nothing from it.
 */
export function OwnerConfirm(props: { who: SlackUser; set: (s: SlackStatus) => void }) {
  const { who, set } = props;
  const [error, setError] = useState<string>();
  const fail = (e: Error) => setError(e.message);
  const handle = who.name ? `@${who.name}` : undefined;
  const title = who.realName ?? handle ?? who.id;
  return (
    <>
      <p>{ASKS[who.via ?? 'home']}</p>
      <div className="sl-who">
        <b className="t-row-title">{title}</b>
        <span className="t-meta">
          {handle && handle !== title && `${handle} · `}
          <code>{who.id}</code>
        </span>
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
