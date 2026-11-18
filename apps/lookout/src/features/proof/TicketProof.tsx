import { BRAND, type GapAction, type Ticket, webUrl } from '@teamtrail/core';
import { DetailSection, Disclosure, type MenuItem, MetaLine, Pill } from '../../components/ui';
import { ProofGapList } from './ProofGapList';
import { proofParts } from './proofParts';
import { reviewModelParts } from './reviewModelParts';
import type { TicketProofView } from './useTicketProof';
import { workToProve } from './workToProve';

/**
 * The inspector's Proof section: the Verified by Teamtrail verdict, what it rests on and what it lacks (each gap with
 * who is on it, and the action that closes it when it's the human's: `actions`), with its
 * digest, where it was posted and the key to commit behind Details. Copy for PR and Approve and merge are in the
 * ticket's actions. Shown for tickets with a completion, and done implementation tickets (where none is the point).
 */
export function TicketProof(props: { ticket: Ticket; view?: TicketProofView; actions?: Map<GapAction, MenuItem> }) {
  const { view } = props;
  if (!view) return null;
  const { proof, post } = view;
  if (!workToProve(props.ticket, proof)) return null;
  const verified = proof.status === 'verified';
  const comment = post?.commentUrl ? webUrl(post.commentUrl) : undefined;
  const parts = proofParts(proof);
  return (
    <DetailSection label="Proof" className="ticket-proof">
      <div className="proof-head">
        <Pill tone={verified ? 'fill' : 'amber'}>{verified ? 'Verified by Teamtrail' : 'Not verified'}</Pill>
        <MetaLine parts={parts.slice(0, -1)} />
      </div>
      {reviewModelParts(proof).map((parts, i) => (
        <div key={i} className="proof-review-model">
          <MetaLine parts={parts} />
        </div>
      ))}
      <ProofGapList gaps={proof.gaps} plan={view.plan} actions={props.actions} />
      <Disclosure>
        <MetaLine parts={['Digest', ...parts.slice(-1)]} />
        {comment && (
          <a className="t-meta" href={comment} target="_blank" rel="noreferrer">
            Posted on pull request #{post!.pr}
          </a>
        )}
        {post?.error && <p className="t-meta">Posting failed, trying again: {post.error}</p>}
        {view.keyFile && (
          <p className="t-meta">
            Signed with this machine&apos;s key. Commit <code>{`${BRAND.dataDir}/${view.keyFile}`}</code> so others can
            check it.
          </p>
        )}
      </Disclosure>
    </DetailSection>
  );
}
