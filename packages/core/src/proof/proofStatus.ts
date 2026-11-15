import type { Proof } from '../model/proof';
import type { ProofStatusCall } from '../model/proofPost';

const short = (sha: string) => sha.slice(0, 7);

/**
 * The `Teamtrail proof` status of a pull request's head: success only when the proof is verified and covers that very
 * commit (or the proof names none); otherwise failure with the first reason. Deterministic, at most 140 characters.
 */
export function proofStatus(proof: Proof, headSha: string): ProofStatusCall {
  const fit = (s: string) => (s.length > 140 ? `${s.slice(0, 139)}…` : s);
  if (proof.status !== 'verified') return { state: 'failure', description: fit(`Not verified: ${proof.gaps[0]}`) };
  const head = proof.git?.head;
  if (head && headSha && !headSha.startsWith(head) && !head.startsWith(headSha))
    return {
      state: 'failure',
      description: fit(`Verified at ${short(head)}; the PR has commits Teamtrail didn't verify (${short(headSha)})`),
    };
  return { state: 'success', description: fit(`Verified by Teamtrail: ${proof.ticket.key} ${proof.ticket.title}`) };
}
