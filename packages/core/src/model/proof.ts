import type { AttemptGuide } from './guide';
import type { VerificationLevel } from './lifecycle';
import type { AttemptResult, VerdictKind } from './verification';

/** Whether a ticket's latest completion is proven, and why not when it isn't. */
export type ProofStatus = 'verified' | 'not-verified';

export interface ProofCheck {
  name: string;
  argv: string[];
  exitCode: number | null;
  durationMs: number;
  passed: boolean;
  /** It failed as it already does on main: a known failure the trail lead accepted, never counted as passed. */
  knownFailure?: true;
}

export interface ProofReview {
  by: string;
  byKind: 'agent' | 'trail lead';
  verdict: VerdictKind;
  summary: string;
  /** The reviewer was not the author: another session, and another origin when both are known. */
  independent: boolean;
}

export interface ProofDecision {
  id: string;
  summary: string;
  decidedBy: string;
  /** The person behind it, when the sign-in named them. */
  decidedByName?: string;
  decidedAt: number;
  /** Replaced by a later decision, so no longer in force. */
  superseded: boolean;
}

/** An Ed25519 signature over a proof's digest, by the machine key `keyId` names (proof-keys/<keyId>.pub). */
export interface ProofSignature {
  keyId: string;
  /** Base64. */
  sig: string;
}

/**
 * What Teamtrail recorded about one ticket's completion, as a PR shows it: built only from recorded data (attempts,
 * verdicts, decisions), never from what an agent says now. `digest` covers everything else, so a copy that was
 * changed no longer matches.
 */
export interface Proof {
  v: 1;
  ticket: { mapId: string; id: string; key: string; title: string; type: string };
  trail: string;
  status: ProofStatus;
  /** Why it isn't verified, one line each; empty when it is. */
  gaps: string[];
  level: VerificationLevel;
  attempt: {
    id: string;
    agent: string;
    result: AttemptResult;
    submittedAt: number;
    finishedAt: number;
    resolution: string;
    pr?: number;
    /** Submitted from another machine: no check ran here and no git was read. */
    remote: boolean;
    /** For a remote completion, the runner that ran its checks where its work is (the embedding server's). */
    runner?: string;
  };
  /** Earlier attempts on the ticket, oldest first. */
  earlier: { id: string; result: AttemptResult }[];
  checks: ProofCheck[];
  criteria: {
    lines: string[];
    verified: number;
    claimed: number;
    missing: number;
    failed: number;
    manual: number;
    confirmed: boolean;
  };
  git?: {
    base: string | null;
    head: string | null;
    branch: string | null;
    files: number;
    add: number;
    del: number;
    flags: string[];
    /**
     * The files the agent declared at its claim and the changed files outside them (evidence/scopeFlag.ts). Missing
     * on attempts from before the scope check.
     */
    scope?: { declared: string[]; outside: string[] };
  };
  reviews: ProofReview[];
  decisions: ProofDecision[];
  /**
   * The guides the work was done under, as its attempt recorded them. Missing for attempts from before guides came
   * by type, so their proofs and digests read as they always did.
   */
  guides?: AttemptGuide[];
  /** `sha256:` of the canonical JSON of every other field. */
  digest: string;
}
