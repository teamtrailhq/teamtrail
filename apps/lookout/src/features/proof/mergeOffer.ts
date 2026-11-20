import type { Proof } from '@teamtrail/core';

/** Merging a done ticket's pull request, as offered here: verified, Approve and merge; not, Merge anyway. */
export interface MergeOffer {
  kind: 'approve' | 'anyway';
  /** Where the server merges (managedSignIn.ts `merge`). */
  path: string;
  /** The gaps Merge anyway accepts, exactly as the proof says them; none when verified. */
  gaps: string[];
}

/**
 * Behind a server that merges pull requests (`path`), a done ticket with work to merge: a completion with a branch
 * and a commit (the proof's git evidence) whose pull request PR sync doesn't say is merged or closed already
 * (`prState`). A research ticket closed by a decision has none. The server checks it all again and merges only at the
 * commit the proof covers.
 */
export function mergeOffer(o: {
  path?: string;
  done: boolean;
  proof?: Proof;
  prState?: string;
}): MergeOffer | undefined {
  const { path, proof } = o;
  if (!path || !o.done || !proof) return undefined;
  const work = !!proof.attempt.id && !!proof.git?.head && !!proof.git.branch;
  const settled = o.prState !== undefined && o.prState !== 'open';
  if (!work || settled) return undefined;
  if (proof.status === 'verified') return { kind: 'approve', path, gaps: [] };
  return { kind: 'anyway', path, gaps: proof.gaps };
}
