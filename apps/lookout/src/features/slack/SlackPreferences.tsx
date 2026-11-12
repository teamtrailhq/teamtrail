import { SLACK_NOTIFY_EVENTS, type SlackNotifyEvent, type SlackStatus } from '@teamtrail/connector-slack';
import { useState } from 'react';
import { Label, Choice, Field, Meta } from '../../components/ui';
import { ChannelTarget } from './ChannelTarget';
import type { slackApi } from './slackApi';
import { EVENT_LABEL } from './SlackStateLine';
import { UserPicker } from './UserPicker';

type Patch = Parameters<typeof slackApi.update>[0];

/** Scout's settings once connected: the owner, who may answer, and where and what Scout notifies. */
export function SlackPreferences(props: { s: SlackStatus; patch: (p: Patch) => void }) {
  const { s, patch } = props;
  const [channel, setChannel] = useState(false);
  const events = new Set(s.notify.events);
  const toChannel = channel || s.notify.target !== 'dm';
  const owner = s.owners[0];
  const toggle = (e: SlackNotifyEvent) => {
    const next = events.has(e) ? s.notify.events.filter((x) => x !== e) : [...s.notify.events, e];
    patch({ notify: { events: next } });
  };
  return (
    <div className="sl-groups">
      <div className="sl-group">
        <Label variant="plain" size="sm">
          Owner
        </Label>
        <div className="sl-owner">
          <b>@{owner?.name ?? owner?.id}</b>
          <span className="t-meta">Added Scout from this machine</span>
        </div>
      </div>
      <div className="sl-group">
        <Label variant="plain" size="sm">
          Allowed users
        </Label>
        <UserPicker key={s.state} value={s.allow} owners={s.owners} onChange={(allow) => patch({ allow })} />
      </div>
      <div className="sl-group">
        <Label variant="plain" size="sm">
          Notify
        </Label>
        <div className="choice-row compact">
          <Choice
            on={!toChannel}
            title="DM to owner"
            onClick={() => {
              setChannel(false);
              patch({ notify: { target: 'dm', detail: 'full' } });
            }}
          />
          <Choice
            on={toChannel}
            title="Channel"
            sub={s.notify.target !== 'dm' ? s.notify.target : undefined}
            onClick={() => setChannel(true)}
          />
        </div>
        {toChannel && (
          <>
            <Field label="Channel ID (invite @Scout there first)">
              <ChannelTarget value={s.notify.target} onSave={(target) => patch({ notify: { target } })} />
            </Field>
            <div className="choice-row compact">
              <Choice
                on={s.notify.detail === 'full'}
                title="Full questions"
                onClick={() => patch({ notify: { detail: 'full' } })}
              />
              <Choice
                on={s.notify.detail === 'titles-only'}
                title="Titles only"
                onClick={() => patch({ notify: { detail: 'titles-only' } })}
              />
            </div>
          </>
        )}
        <div className="choice-row compact">
          {SLACK_NOTIFY_EVENTS.map((e) => (
            <Choice key={e} on={events.has(e)} title={EVENT_LABEL[e]} onClick={() => toggle(e)} />
          ))}
        </div>
      </div>
      <Meta
        className="dim"
        parts={[`${s.command} decide`, `${s.command} status`, `${s.command} inbox`, 'Save as decision on any message']}
      />
    </div>
  );
}
