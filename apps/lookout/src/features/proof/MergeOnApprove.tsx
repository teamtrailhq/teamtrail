import { managedSignIn } from '../../lib/managedSignIn';
import { ApproveAndMerge } from './ApproveAndMerge';
import { MergeAnyway } from './MergeAnyway';
import type { TicketProofView } from './useTicketProof';

/**
 * Behind a server that merges pull requests (managedSignIn.ts `merge`), a done ticket always has a way to merge:
 * verified, Approve and merge; not verified, Merge anyway, with why in one line and an explicit question first. The
 * server checks it all again (done, the proof or the trail lead's acceptance of its gaps, the pull request's head
 * still the proof's commit, who may approve) and merges only at that commit. Nothing elsewhere.
 */
export function MergeOnApprove(props: { mapId: string; ticketId: string; proof?: TicketProofView }) {
  const path = managedSignIn()?.merge;
  const proof = props.proof?.proof;
  if (!path || !proof) return null;
  const at = { path, mapId: props.mapId, ticketId: props.ticketId };
  if (proof.status === 'verified') return <ApproveAndMerge {...at} />;
  return <MergeAnyway {...at} gaps={proof.gaps} />;
}
