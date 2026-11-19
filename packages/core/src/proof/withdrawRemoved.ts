import { TrackerError } from '../adapters/remote/http';
import type { ProofPostRecord, ProofPublisher, ProofStatusCall } from '../model/proofPost';
import { redact } from '../verification/redact';
import { proofBadge } from './proofBadge';
import { proofMarker } from './proofMarker';
import { dropProofPost, readProofPosts, writeProofPost } from './proofPostStore';

const REMOVED_STATUS: ProofStatusCall = {
  state: 'failure',
  description: 'The ticket this proof was for was removed',
};

/** What the proof comment says once its ticket is gone: not verified, and why. Starts with the proof marker. */
const removedComment = (r: ProofPostRecord) =>
  [
    proofMarker(r.digest),
    proofBadge('not-verified'),
    '',
    '**Not verified by Teamtrail.** The ticket this proof was for was removed, so nothing here is verified any more.',
  ].join('\n');

/** This machine posted something to the PR: a comment, or a status that went through. */
const posted = (r: ProofPostRecord) => !!r.postedAt || !!r.commentUrl;

/**
 * The proofs of tickets that are gone (a ticket or a whole trail removed): the pull request each was posted to gets a
 * final failing `Teamtrail proof` status on the head it was posted for and its comment edited to say so, once, from
 * what this machine recorded posting; then the record goes. A record never posted just goes. A failed try is kept
 * with its error and tried again on the next pass. `kept` holds `<mapId>/<ticketId>` of every ticket there is.
 */
export async function withdrawRemoved(env: {
  root: string;
  publisher: ProofPublisher;
  kept: Set<string>;
  now?: () => number;
}): Promise<ProofPostRecord[]> {
  const out: ProofPostRecord[] = [];
  for (const r of readProofPosts(env.root)) {
    if (env.kept.has(`${r.mapId}/${r.ticketId}`)) continue;
    if (!posted(r)) {
      dropProofPost(env.root, r.mapId, r.ticketId);
      continue;
    }
    out.push(await withdrawOne(env, r));
  }
  return out;
}

async function withdrawOne(env: { root: string; publisher: ProofPublisher; now?: () => number }, r: ProofPostRecord) {
  const now = (env.now ?? Date.now)();
  try {
    const { url } = await env.publisher.upsertComment(r.pr, removedComment(r));
    await env.publisher.setStatus(r.headSha, { ...REMOVED_STATUS, targetUrl: url });
    dropProofPost(env.root, r.mapId, r.ticketId);
    const { error: _error, ...rest } = r;
    return { ...rest, state: REMOVED_STATUS.state, commentUrl: url, postedAt: now, triedAt: now };
  } catch (e) {
    const failed = { ...r, triedAt: now, error: redact(String((e as Error)?.message ?? e)).slice(0, 300) };
    // the pull request or its head is gone from the host: nothing left to withdraw
    if (e instanceof TrackerError && e.code === 'not_found') dropProofPost(env.root, r.mapId, r.ticketId);
    // otherwise kept, with when and why it failed, so the next pass tries again
    else writeProofPost(env.root, failed);
    return failed;
  }
}
