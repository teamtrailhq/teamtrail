import { sinceLabel } from '../../lib';
import type { TicketAutoMerge } from '../../lib/ticketAutoMergeOf';

/**
 * One line under the pull request, behind a server that merges verified pull requests itself: why its auto-merge
 * waits (with its setting, on this origin), or when it merged this one. Nothing otherwise.
 */
export function AutoMergeLine(props: { auto?: TicketAutoMerge; prUrl?: string }) {
  const { auto } = props;
  if (!auto || auto.kind === 'none') return null;
  if (auto.kind === 'merged') {
    const url = props.prUrl ? undefined : auto.url;
    return (
      <p className="t-meta pr-auto-merge merged">
        Merged automatically {sinceLabel(auto.at)}
        {url && (
          <>
            {' · '}
            <a href={url} target="_blank" rel="noreferrer noopener">
              See the pull request
            </a>
          </>
        )}
      </p>
    );
  }
  return (
    <p className="t-meta pr-auto-merge waiting">
      Auto-merge waits: {auto.why}
      {auto.settings && (
        <>
          {' · '}
          <a href={auto.settings}>Auto-merge settings</a>
        </>
      )}
    </p>
  );
}
