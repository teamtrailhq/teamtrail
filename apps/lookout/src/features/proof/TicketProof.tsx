import { BRAND, webUrl, type Ticket } from '@teamtrail/core';
import { DetailSection, Disclosure, MetaLine, Pill } from '../../components/ui';
import { proofParts } from './proofParts';
import type { TicketProofView } from './useTicketProof';

/**
 * The inspector's Proof section: the Verified by Teamtrail verdict, what it rests on and what it lacks, with its
 * digest, where it was posted and the key to commit behind Details. Copy for PR and Approve and merge are in the
 * action bar. Shown for done tickets and tickets with a completion.
 */
export function TicketProof(props: { ticket: Ticket; view?: TicketProofView }) {
  const { view } = props;
  if (!view) return null;
  const { proof, post } = view;
  const done = props.ticket.state === 'closed' && props.ticket.closeReason === 'completed';
  if (!done && !proof.attempt.id) return null;
  const verified = proof.status === 'verified';
  const comment = post?.commentUrl ? webUrl(post.commentUrl) : undefined;
  const parts = proofParts(proof);
  return (
    <DetailSection label="Proof" className="ticket-proof">
      <div className="proof-head">
        <Pill tone={verified ? 'fill' : 'amber'}>{verified ? 'Verified by Teamtrail' : 'Not verified'}</Pill>
        <MetaLine parts={parts.slice(0, -1)} />
      </div>
      {proof.gaps.length > 0 && (
        <ul className="proof-gaps t-meta">
          {proof.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
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
