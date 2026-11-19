import type { TicketAutoMerge } from '../../lib/ticketAutoMergeOf';
import { AutoMergeLine } from './AutoMergeLine';
import { PrLinkActions } from './PrLinkActions';

/**
 * A ticket PR sync has no pull request for (yet): behind a server that merges by itself, its auto-merge line alone
 * (it waits, and why; or it merged, with the PR's link), since that server may know the PR before PR sync reads it.
 * Otherwise, with `offerLink`, Link a pull request on this machine; else nothing.
 */
export function PrNoSyncBlock(props: { mapId: string; ticketId: string; auto?: TicketAutoMerge; offerLink?: boolean }) {
  const { auto } = props;
  if (auto && auto.kind !== 'none')
    return (
      <div className="pr-block pr-auto-only">
        <AutoMergeLine auto={auto} />
      </div>
    );
  if (!props.offerLink) return null;
  return <PrLinkActions mapId={props.mapId} ticketId={props.ticketId} />;
}
