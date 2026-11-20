import type { PullRequestSnapshot } from '../model/prEvidence';
import type { Proof } from '../model/proof';

/** The head Merge anyway is bound to, and whether it is the pull request's because the proof names no commit. */
export interface MergeHead {
  head: string;
  atPrHead: boolean;
  /** With `atPrHead`, the pull request it is the head of. */
  pr?: number;
}

/**
 * The commit a Merge anyway is about: the one the proof covers, as always; when the proof names none (a ticket finished
 * with no checks set), the head of its open pull request as PR sync keeps it, which is what the Lookout shows. None
 * when there is neither. Pure.
 */
export function mergeHead(o: { proof: Pick<Proof, 'git'>; pr?: PullRequestSnapshot }): MergeHead | undefined {
  const own = o.proof.git?.head;
  if (own) return { head: own, atPrHead: false };
  const pr = o.pr;
  if (pr?.state !== 'open' || !pr.headSha) return undefined;
  return { head: pr.headSha, atPrHead: true, pr: pr.number };
}
