import { leaseHealth, type TicketLease } from '@teamtrail/core';
import { Disclosure, Fact, MetaLine } from '../../components/ui';
import { ago, dur, hhmm } from '../../lib';

/**
 * An agent's claim in the Progress section: who and since when, when it goes back to the queue, its worktree branch,
 * the files it said it would change, and its latest note (the earlier ones behind Details).
 */
export function LeaseFacts({ lease, now }: { lease: TicketLease; now: number }) {
  const health = leaseHealth(lease, now);
  const latest = lease.notes.at(-1);
  return (
    <>
      <Fact label="Claim">
        <span className="t-body">
          {lease.agent} since {hhmm(lease.claimedAt)}
        </span>
        <MetaLine
          parts={[
            `active ${ago(now - lease.renewedAt)} ago`,
            health === 'live' && queueLine(span(lease.expiresAt - now)),
          ]}
        />
      </Fact>
      {lease.workspace && (
        <Fact label="Branch">
          <code className="t-code">{lease.workspace.branch}</code>
          <MetaLine parts={['its own worktree']} />
        </Fact>
      )}
      {!!lease.touches?.length && (
        <Fact label="Changes">
          <span className="t-code">{lease.touches.join(', ')}</span>
        </Fact>
      )}
      {latest && (
        <Fact label="Latest note">
          <span className="t-body">{latest}</span>
          {lease.notes.length > 1 && (
            <Disclosure label="Earlier notes">
              <ul className="lease-notes t-meta">
                {lease.notes.slice(0, -1).map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Disclosure>
          )}
        </Fact>
      )}
    </>
  );
}

/** A live claim's timeout; once the agent went quiet, the state line says when it goes back. */
function queueLine(left: string) {
  return `back in the queue after ${left} without activity`;
}

/** Long leases read in days ("7 days"), short ones as hours and minutes. */
function span(ms: number) {
  const days = ms / 86_400_000;
  if (days >= 2) return `${Math.round(days)} days`;
  return dur(Math.max(0, ms));
}
