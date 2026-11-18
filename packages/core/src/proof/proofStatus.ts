import type { Proof } from '../model/proof';
import type { ProofStatusCall } from '../model/proofPost';
import { coversHead } from './coversHead';

const short = (sha: string) => sha.slice(0, 7);

/**
 * The `Teamtrail proof` status of a pull request's head: success only when the proof is verified and covers that very
 * commit (coversHead.ts, as `teamtrail proof verify` judges it); otherwise failure with the first reason. A proof that
 * names no commit fails. Deterministic, at most 140 characters.
 */
export function proofStatus(proof: Proof, headSha: string): ProofStatusCall {
  const fit = (s: string) => (s.length > 140 ? `${s.slice(0, 139)}…` : s);
  if (proof.status !== 'verified') return { state: 'failure', description: fit(`Not verified: ${proof.gaps[0]}`) };
  const head = proof.git?.head;
  if (!head)
    return { state: 'failure', description: fit(`The proof names no commit, so it can't cover ${short(headSha)}`) };
  if (!coversHead(head, headSha))
    return {
      state: 'failure',
      description: fit(`Verified at ${short(head)}; the PR has commits Teamtrail didn't verify (${short(headSha)})`),
    };
  return { state: 'success', description: fit(`Verified by Teamtrail: ${proof.ticket.key} ${proof.ticket.title}`) };
}
