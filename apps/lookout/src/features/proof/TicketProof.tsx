import { BRAND, type GapAction, type Ticket, webUrl } from '@teamtrail/core';
import { DetailSection, type MenuItem, MetaLine, StatusMark } from '../../components/ui';
import { ProofChecks } from './ProofChecks';
import { ProofGapList } from './ProofGapList';
import { proofParts } from './proofParts';
import type { TicketProofView } from './useTicketProof';
import { workToProve } from './workToProve';

/**
 * The inspector's Proof section: the verdict (verified in green, at the commit it covers), each check as its own line
 * with the check guard and the reviews, what else it rests on, what it lacks (each gap with its owner and, when it's
 * the human's, the action that closes it: `actions`), and at its foot the digest, where it was posted and the key to
 * commit. Copy for PR and Approve and merge are in the ticket's actions. Shown for tickets with a completion, and done
 * implementation tickets (where none is the point).
 */
export function TicketProof(props: {
  ticket: Ticket;
  view?: TicketProofView;
  actions?: Map<GapAction, MenuItem>;
  /** The ticket's primary action: a gap whose action it is shows no button of its own. */
  primary?: MenuItem;
  /** Each check's repo-relative folder, from the attempt the proof is of. */
  folders?: ReadonlyMap<string, string>;
}) {
  const { view } = props;
  if (!view) return null;
  const { proof, post } = view;
  if (!workToProve(props.ticket, proof)) return null;
  const verified = proof.status === 'verified';
  const comment = post?.commentUrl ? webUrl(post.commentUrl) : undefined;
  const head = proof.git?.head?.slice(0, 7);
  return (
    <DetailSection label="Proof" className="ticket-proof">
      <div className={verified ? 'proof-verdict verified' : 'proof-verdict'}>
        <StatusMark kind={verified ? 'verified' : 'todo'} />
        <b>{verified ? 'Verified by Teamtrail' : 'Not verified'}</b>
        {head && <span className="t-meta t-code">at {head}</span>}
      </div>
      <ProofChecks proof={proof} folders={props.folders} />
      <MetaLine parts={proofParts(proof)} />
      <ProofGapList gaps={proof.gaps} plan={view.plan} actions={props.actions} primary={props.primary} />
      <div className="proof-foot">
        <span className="proof-digest">
          {[`${proof.digest.slice(0, 19)}…`, view.keyFile && 'signed ed25519', view.keyFile]
            .filter(Boolean)
            .join(' · ')}
        </span>
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
      </div>
    </DetailSection>
  );
}
