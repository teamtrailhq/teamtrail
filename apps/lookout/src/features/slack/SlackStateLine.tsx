import type { SlackNotifyEvent, SlackStatus } from '@teamtrail/connector-slack';
import { BRAND } from '@teamtrail/core';

export const EVENT_LABEL: Record<SlackNotifyEvent, string> = {
  awaiting: 'Awaiting you',
  blocked: 'Blocked',
  'trail.done': 'Trail done',
  resolved: 'Resolved',
};

export function SlackStateLine({ s }: { s: SlackStatus }) {
  const [cls, text] = stateLine(s);
  return (
    <div className={`sync-line ${cls}`} title={s.error}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}

function stateLine(s: SlackStatus): [string, string] {
  switch (s.state) {
    case 'online':
      return ['ok', 'Online'];
    case 'connecting':
      return ['', 'Connecting'];
    case 'offline':
      return ['warn', 'Offline · reconnecting'];
    case 'auth-error':
      return ['alert', `Disconnected · ${s.error ?? 'add Scout to Slack again'}`];
    case 'elsewhere': {
      const holder = s.heldBy ? ` (${s.heldBy})` : '';
      return ['warn', `Connected from another ${BRAND.slug}${holder}`];
    }
    case 'other-service':
      return ['alert', 'Not connected · this Teamtrail points at another Scout service'];
    case 'unsupported':
      return ['alert', s.error ?? 'Not supported here'];
    default:
      return ['', s.connected ? 'Off' : 'Not connected'];
  }
}
