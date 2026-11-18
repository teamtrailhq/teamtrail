import type { SyncStatus } from '@teamtrail/core';
import { syncedAgo, hhmm } from '../../lib';

export function SyncLine({ status }: { status?: SyncStatus }) {
  if (!status) return null;
  const rate = status.rate?.limit
    ? `${status.rate.remaining?.toLocaleString() ?? '?'}/${status.rate.limit.toLocaleString()} req`
    : '';
  const dropped = status.dropped ?? [];
  const refused = dropped.length ? ` · ${dropped.length} not sent` : '';
  const queued = `${status.queued ? ` · ${status.queued} queued` : ''}${refused}`;
  const [cls, text] = stateLine(status, queued);
  // the writes the tracker refused for good stay listed (online again doesn't clear them), with why
  const error = status.error?.startsWith('Dropped queued write') ? undefined : status.error;
  const title = [error, ...dropped.map((d) => `Not sent (${d.label}): ${d.error}`)].filter(Boolean).join('\n');
  return (
    <div className={`sync-line ${cls}`} title={title || undefined}>
      <span className="dot" />
      <span>{text}</span>
      {rate && <span className="rate">{rate}</span>}
    </div>
  );
}

function stateLine(status: SyncStatus, queued: string): [string, string] {
  switch (status.state) {
    case 'online':
      return ['ok', `Online · synced ${syncedAgo(status.lastSyncAt)}${queued}`];
    case 'offline':
      return ['warn', `Offline${queued}`];
    case 'rate-limited':
      return ['warn', `Rate limited · resumes ${hhmm(status.resetAt)}${queued}`];
    case 'auth-error':
      return ['alert', `Credentials rejected${queued}`];
    default:
      return ['', `Connecting${queued}`];
  }
}
