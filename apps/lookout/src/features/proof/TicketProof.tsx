import { BRAND, webUrl, type Ticket } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine, Pill } from '../../components/ui';
import { MergeOnApprove } from './MergeOnApprove';
import { proofParts } from './proofParts';
import { useTicketProof } from './useTicketProof';

/**
 * In the inspector: the ticket's Verified by Teamtrail report as its pull request shows it, with Copy for PR and the
 * comment's link once this machine posted it. Shown for done tickets and tickets with a completion.
 */
export function TicketProof(props: { mapId: string; ticket: Ticket }) {
  const view = useTicketProof(props.mapId, props.ticket.id);
  const [copied, setCopied] = useState(false);
  if (!view) return null;
  const { proof, post } = view;
  const done = props.ticket.state === 'closed' && props.ticket.closeReason === 'completed';
  if (!done && !proof.attempt.id) return null;
  const verified = proof.status === 'verified';
  const copy = () =>
    void navigator.clipboard.writeText(view.markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  const comment = post?.commentUrl ? webUrl(post.commentUrl) : undefined;
  return (
    <section className="d-section ticket-proof">
      <span className="t-label">Proof</span>
      <div className="proof-head">
        <Pill tone={verified ? 'fill' : 'amber'}>{verified ? 'Verified by Teamtrail' : 'Not verified'}</Pill>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy for PR'}
        </Button>
      </div>
      {proof.gaps.length > 0 && (
        <ul className="proof-gaps t-meta">
          {proof.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}
      <MetaLine className="t-meta" parts={proofParts(proof)} />
      {done && <MergeOnApprove mapId={props.mapId} ticketId={props.ticket.id} verified={verified} />}
      {comment && (
        <a className="t-meta" href={comment} target="_blank" rel="noreferrer">
          Posted on pull request #{post!.pr}
        </a>
      )}
      {post?.error && <span className="t-meta">Posting failed, trying again: {post.error}</span>}
      {view.keyFile && (
        <span className="t-meta">
          Signed with this machine&apos;s key. Commit <code>{`${BRAND.dataDir}/${view.keyFile}`}</code> so others can
          check it.
        </span>
      )}
    </section>
  );
}
