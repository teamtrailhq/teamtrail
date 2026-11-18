/**
 * Why a proof isn't verified, as a kind (proof/proofGapItems.ts): what the line is about, so what closes it
 * (proof/gapPlan.ts) never depends on parsing its words.
 */
export type ProofGapKind =
  | 'no-completion'
  | 'verification-off'
  | 'remote-unchecked'
  | 'runner-no-commit'
  | 'checks-failed'
  | 'known-failures'
  | 'waived-check'
  | 'retried'
  | 'check-guard'
  | 'criteria-missing-evidence'
  | 'criteria-failed'
  | 'criteria-unconfirmed'
  | 'rule-unanswered'
  | 'rule-waived'
  | 'review-not-pass'
  | 'no-independent-review'
  | 'trail-lead-not-approved';

/** One gap: its kind and the line the proof shows (`Proof.gaps`). */
export interface ProofGapItem {
  kind: ProofGapKind;
  text: string;
}

/** Who a gap waits on: an agent, the checks on main, the human, or nobody (nothing can close it). */
export type GapOwner = 'agent' | 'main' | 'you' | 'accepted' | 'nobody';

/** What the human can do about a gap in the Lookout; the Lookout maps each to its own action. */
export type GapAction =
  | 'confirm-criteria'
  | 'confirm-and-verify'
  | 'verify-again'
  | 'approve'
  | 'accept-pass'
  | 'rework'
  | 'undo-waiver'
  | 'open-main-checks';

/** A gap with who is on it, in words, and the human's action when it's theirs. */
export interface GapStanding extends ProofGapItem {
  owner: GapOwner;
  /** Who is on it or why nobody is, in one line ("An agent is reviewing it", "Needs you: …"). */
  status: string;
  action?: GapAction;
}
