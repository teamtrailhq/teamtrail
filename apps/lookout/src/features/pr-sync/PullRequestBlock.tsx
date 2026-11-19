import { type TicketSync, webUrl } from '@teamtrail/core';
import { MetaLine, Pill } from '../../components/ui';
import { cx } from '../../lib';
import { AutoMergeLine } from './AutoMergeLine';
import { PR_STATE_TEXT, prBlock } from './prBlock';
import { PrLinkActions } from './PrLinkActions';
import { PrNoSyncBlock } from './PrNoSyncBlock';
import { useTicketAutoMerge } from './useTicketAutoMerge';

/**
 * The ticket's pull request, near the top of its bubble and full ticket: its state as a chip, number and title, and
 * Open pull request; under it one line with its checks, whether it is (or was merged) at the commit the proof covers,
 * and when it was last read. Any ticket with a PR, open or merged. The title is untrusted and only plain text. Behind
 * a server that merges verified pull requests itself, one more line: why it waits, or that it merged by itself, even
 * before PR sync has read the PR. On this machine, Link a different PR and Unlink (PrLinkActions); with `offerLink`
 * (the full ticket, while PR sync works), a ticket without a PR offers Link a pull request.
 */
export function PullRequestBlock(props: {
  mapId: string;
  ticketId: string;
  sync?: TicketSync;
  proofHead?: string | null;
  /** The PR sync's last good tick: how fresh the snapshot is (prBlock). */
  lastOkAt?: number;
  offerLink?: boolean;
}) {
  const auto = useTicketAutoMerge(props.mapId, props.ticketId);
  const b = prBlock(props.sync, props.proofHead, props.lastOkAt);
  if (!b)
    return <PrNoSyncBlock mapId={props.mapId} ticketId={props.ticketId} auto={auto} offerLink={props.offerLink} />;
  const url = webUrl(b.url);
  return (
    <div className={cx('pr-block', `pr-${b.state}`)}>
      <div className="pr-block-head">
        <Pill className="pr-state">{PR_STATE_TEXT[b.state]}</Pill>
        <span className="t-row-title pr-block-title" title={b.title}>
          <span className="t-code">PR #{b.number}</span>
          {b.title && <span className="pr-block-name"> {b.title}</span>}
        </span>
        {url && (
          <a className="btn sm pr-open" href={url} target="_blank" rel="noreferrer noopener">
            Open pull request ↗
          </a>
        )}
      </div>
      <MetaLine parts={b.parts} />
      <AutoMergeLine auto={auto} prUrl={url} />
      <PrLinkActions mapId={props.mapId} ticketId={props.ticketId} linked={b.number} />
    </div>
  );
}
