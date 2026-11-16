import { BRAND, type AttentionPrefs, type NotifyChannel } from '@teamtrail/core';
import { MetaLine, Select, type SelectOption } from '../../components/ui';
import { useAttention } from '../attention';
import { FocusHoursRow } from './FocusHoursRow';
import { ReviewLimitRow } from './ReviewLimitRow';
import { SettingsSection } from './SettingsSection';
import { useThisMachine } from './useThisMachine';

const CHANNELS: SelectOption<NotifyChannel>[] = [
  { value: 'browser', label: 'Browser notification' },
  { value: 'slack-dm', label: 'Slack DM' },
  { value: 'slack-channel', label: 'Slack channel' },
  { value: 'none', label: 'Nothing, I check the queue' },
];

/** The browser only asks for permission from a click, so this runs when the browser channel is picked. */
function askBrowserPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default')
    void Notification.requestPermission();
}

/** When Teamtrail may interrupt you. The team's rules live in attention.json; channel and quiet hours are yours. */
export function AttentionSection() {
  const { view, error, savePrefs, saveReviewLimit } = useAttention(0);
  const local = useThisMachine();
  if (!view) return null;
  const team = view.policy.value;
  const file = `${BRAND.dataDir}/attention.json`;
  const save = (patch: Partial<AttentionPrefs>) => void savePrefs({ ...view.prefs, ...patch });
  const denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  return (
    <SettingsSection title="Attention">
      <p className="vf-intro">
        Everything that needs you is ranked in Waiting on you. Only items scoring {team.interrupt} or more interrupt
        you; the rest wait in the queue, and Slack gets them in a digest.
      </p>
      <div className="att-settings-row set-field">
        <span className="set-field-label">Interrupt me by</span>
        <Select
          compact
          aria-label="Interrupt me by"
          value={view.prefs.channel}
          options={CHANNELS}
          onChange={(channel) => {
            if (channel === 'browser') askBrowserPermission();
            save({ channel });
          }}
        />
      </div>
      {view.prefs.channel === 'browser' && denied && (
        <span className="vf-err">The browser blocks notifications for this page. Allow them in its site settings.</span>
      )}
      <FocusHoursRow focus={view.prefs.focus} onChange={(focus) => save({ focus })} />
      <span className="set-hint t-meta">Your channel and quiet hours stay on this machine.</span>
      <ReviewLimitRow
        limit={team.reviewLimit}
        review={view.review}
        local={local}
        onChange={(limit) => void saveReviewLimit(limit)}
      />
      {view.policy.errors.length > 0 && (
        <ul className="vf-errors">
          {view.policy.errors.map((e) => (
            <li key={e}>
              {file}: {e}
            </li>
          ))}
        </ul>
      )}
      <MetaLine
        className="set-hint"
        parts={[
          view.policy.exists ? { text: file, code: true } : 'Team defaults',
          `interrupt at ${team.interrupt}`,
          team.digestMinutes ? `Slack digest every ${team.digestMinutes} min` : 'Slack digest off',
          team.reviewLimit ? `review limit ${team.reviewLimit}` : 'review limit off',
        ]}
      />
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
