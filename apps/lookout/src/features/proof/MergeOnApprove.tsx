import { managedSignIn } from '../../lib/managedSignIn';
import { ApproveAndMerge } from './ApproveAndMerge';
import { MergeAnyway } from './MergeAnyway';
import type { TicketProofView } from './useTicketProof';

/**
 * Behind a server that merges pull requests (managedSignIn.ts `merge`), a done ticket with work to merge has a way to
 * merge it: verified, Approve and merge; not verified, Merge anyway, with why in one line and an explicit question
 * first. Work to merge is a completion with a branch and a commit (the proof's git evidence) whose pull request isn't
 * merged or closed already (`prState`, from PR sync when there is one): a research ticket closed by a decision has
 * none. The server checks it all again (done, the proof or the trail lead's acceptance of its gaps, the pull
 * request's head still the proof's commit, who may approve) and merges only at that commit. Nothing elsewhere.
 */
export function MergeOnApprove(props: { mapId: string; ticketId: string; proof?: TicketProofView; prState?: string }) {
  const path = managedSignIn()?.merge;
  const proof = props.proof?.proof;
  if (!path || !proof) return null;
  const work = !!proof.attempt.id && !!proof.git?.head && !!proof.git.branch;
  const settled = props.prState !== undefined && props.prState !== 'open';
  if (!work || settled) return null;
  const at = { path, mapId: props.mapId, ticketId: props.ticketId };
  if (proof.status === 'verified') return <ApproveAndMerge {...at} />;
  return <MergeAnyway {...at} gaps={proof.gaps} />;
}
