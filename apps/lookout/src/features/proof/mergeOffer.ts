import type { Proof } from '@teamtrail/core';

/** Merging a done ticket's pull request, as offered here: verified, Approve and merge; not, Merge anyway. */
export interface MergeOffer {
  kind: 'approve' | 'anyway';
  /** Where the server merges (managedSignIn.ts `merge`). */
  path: string;
  /** The gaps Merge anyway accepts, exactly as the proof says them; none when verified. */
  gaps: string[];
  /**
   * When the proof names no commit (finished with no checks set): the pull request's head as PR sync shows it, which
   * Merge anyway accepts and the server merges only while it is still the head.
   */
  head?: string;
}

/**
 * Behind a server that merges pull requests (`path`), a done ticket with work to merge whose pull request PR sync
 * doesn't say is merged or closed already (`prState`): a completion with a branch and a commit (the proof's git
 * evidence), merged only at the commit the proof covers; or, when the proof names no commit, an open pull request,
 * merged anyway only at its head as shown (`prHead`). A research ticket closed by a decision has neither. The server
 * checks it all again.
 */
export function mergeOffer(o: {
  path?: string;
  done: boolean;
  proof?: Proof;
  prState?: string;
  prHead?: string;
}): MergeOffer | undefined {
  const { path, proof } = o;
  if (!path || !o.done || !proof) return undefined;
  const settled = o.prState !== undefined && o.prState !== 'open';
  if (settled) return undefined;
  if (!proof.git?.head) return atPrHead({ path, proof, prState: o.prState, prHead: o.prHead });
  const work = !!proof.attempt.id && !!proof.git.branch;
  if (!work) return undefined;
  if (proof.status === 'verified') return { kind: 'approve', path, gaps: [] };
  return { kind: 'anyway', path, gaps: proof.gaps };
}

/** A proof naming no commit is never verified: Merge anyway, at the open pull request's head as shown. */
function atPrHead(o: { path: string; proof: Proof; prState?: string; prHead?: string }): MergeOffer | undefined {
  if (o.prState !== 'open' || !o.prHead) return undefined;
  return { kind: 'anyway', path: o.path, gaps: o.proof.gaps, head: o.prHead };
}
