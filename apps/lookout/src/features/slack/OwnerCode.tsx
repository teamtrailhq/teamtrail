import type { SlackOwnerCode, SlackStatus } from '@teamtrail/connector-slack';
import { useState } from 'react';
import { Button, Meta } from '../../components/ui';
import { ExtLink } from './ExtLink';
import { slackApi } from './slackApi';
import { SlackStateLine } from './SlackStateLine';
import { WrongTries } from './WrongTries';

const minutesLeft = (expiresAt: number) => Math.max(1, Math.ceil((expiresAt - Date.now()) / 60_000));

/**
 * Proving which Slack account is the trail lead's: a one-time code shown here, on the machine Teamtrail runs on,
 * and typed into Scout's Home tab in Slack. The code is in the answer that made it and nowhere else, so a reload
 * asks for a new one.
 */
export function OwnerCode(props: { s: SlackStatus; set: (s: SlackStatus) => void }) {
  const { s, set } = props;
  // After an upgrade the note above already says why and how; this one would say it again.
  const intro = !s.ownerRedo;
  const [made, setMade] = useState<SlackOwnerCode>();
  const [error, setError] = useState<string>();
  const get = () =>
    void slackApi.ownerCode().then(
      (r) => {
        setError(undefined);
        setMade(r);
        set(r.status);
      },
      (e: Error) => setError(e.message),
    );
  const waiting = made && s.ownerCode?.expiresAt === made.expiresAt ? made : undefined;
  if (!waiting)
    return (
      <>
        {intro && (
          <p>
            Show Scout which Slack account is yours. Get a code here, then enter it in Scout's Home tab in Slack. Until
            then Scout sends nothing to anyone.
          </p>
        )}
        <div className="sl-actions">
          <Button variant="primary" onClick={get}>
            Get a code
          </Button>
        </div>
        {s.ownerCodeDropped && <WrongTries tries={s.ownerCodeDropped.by} dropped />}
        {made && !s.ownerCodeDropped && (
          <div className="test-line alert">That code expired or was used up. Get a new one.</div>
        )}
        {error && <div className="test-line alert">✕ {error}</div>}
        <SlackStateLine s={s} />
      </>
    );
  return (
    <>
      <p>
        In Slack, open Scout's <b>Home</b> tab → <b>Enter code</b>, and type:
      </p>
      <output className="sl-code" aria-label="One-time code">
        {waiting.code}
      </output>
      <div className="sl-actions">
        <ExtLink primary href={s.links.home}>
          Open Scout in Slack
        </ExtLink>
        {s.links.homeWeb && <ExtLink href={s.links.homeWeb}>Open in browser</ExtLink>}
        <Button variant="ghost" onClick={get}>
          New code
        </Button>
      </div>
      {error && <div className="test-line alert">✕ {error}</div>}
      <Meta className="dim" parts={['Works once', `Valid for ${minutesLeft(waiting.expiresAt)} min`]} />
      {s.ownerCode && s.ownerCode.wrongTries.length > 0 && <WrongTries tries={s.ownerCode.wrongTries} />}
      <SlackStateLine s={s} />
    </>
  );
}
