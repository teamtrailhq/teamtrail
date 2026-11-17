import { webUrl } from '@teamtrail/core';
import { usePrSync } from '../../hooks';
import { prSync, syncedAgo } from '../../lib';

const CHECKS: Record<string, string> = {
  passed: 'checks passed',
  failing: 'checks failing',
  pending: 'checks pending',
  unknown: 'checks unknown',
  none: 'no checks',
};

/**
 * The ticket's PR and its CI result (the inspector's state line says its mismatch flags). PR titles and branch
 * names are untrusted and only ever rendered as plain text.
 */
export function PrFlagBadges({ mapId, ticketId }: { mapId: string; ticketId: string }) {
  const s = prSync.ticket(usePrSync(), mapId, ticketId);
  if (!s) return null;
  const pr = s.pr;
  return (
    <div className="pr-flags">
      <span className={`pr-chip pr-${pr?.state ?? 'unread'}`} title={pr ? `${pr.title}\n${pr.headRef}` : undefined}>
        {pr ? (
          <a href={webUrl(pr.url)} target="_blank" rel="noreferrer noopener">
            PR #{pr.number} · {pr.state}
            {pr.draft ? ' · draft' : ''}
          </a>
        ) : (
          `PR #${s.link.number}`
        )}
        <span className={`ci ci-${s.checksSummary}`}>{CHECKS[s.checksSummary]}</span>
        <span className="when">{syncWhen(s)}</span>
      </span>
    </div>
  );
}

function syncWhen(s: NonNullable<ReturnType<typeof prSync.ticket>>) {
  if (s.error) return 'sync failed';
  if (s.syncedAt) return syncedAgo(s.syncedAt);
  return 'not synced yet';
}
