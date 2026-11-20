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
  /**
   * The reviewer was not the author: another session, and another origin when both are known. A review the
   * `independent-review` gate held, on the author's own model, is not independent.
   */
  independent: boolean;
  /** The model the reviewer ran on. Missing when it reported none, so older proofs and digests read as they did. */
  model?: string;
  /** The reviewer ran the author's model: `held` didn't count (the gate enforces), `observed` did. */
  sameModel?: 'observed' | 'held';
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

/** A check the trail lead accepted the work without: it didn't run, and the proof says who skipped it and why. */
export interface ProofWaived {
  name: string;
  argv: string[];
  by: string;
  reason: string;
}

/** A check not run because the change was outside its `paths`: `changes outside apps/web`. */
export interface ProofOutOfScope {
  name: string;
  argv: string[];
  reason: string;
}

/**
 * A check that passed only on retry: it had failed on the same code in an earlier attempt (the `flaky` gate). Held
 * work counts only once the trail lead accepted the pass (`accepted`); observed work went through, flagged.
 */
export interface ProofRetried {
  name: string;
  test?: string;
  /** The attempt it failed in, and the commit both runs were on. */
  failedIn: string;
  head: string | null;
  mode: 'observe' | 'enforce';
  /** The trail lead counted the pass. */
  accepted: boolean;
}

/**
 * The check guard's findings on the attempt (checkGuard/), one line each. `enforce`: the pass counted only once the
 * trail lead accepted it (`accepted`, from their PASS on the attempt); until then it's a gap. `observe`: shown only.
 */
export interface ProofGuard {
  mode: 'observe' | 'enforce';
  findings: string[];
  accepted?: { by: string; reason: string };
}

/**
 * A diff rule the work's changed files matched: its check as it ran here (`passed`, null when it didn't run), and its
 * question with the agent's answer (claimed, never verified), the trail lead's waiver, or `unanswered`.
 */
export interface ProofRule {
  id: string;
  why: string;
  files: string[];
  check?: { name: string; passed: boolean | null };
  ask?: string;
  answer?: string;
  waived?: { by: string; reason: string };
  unanswered?: true;
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
    /** The model the author ran on, when known. */
    model?: string;
  };
  /** Earlier attempts on the ticket, oldest first. */
  earlier: { id: string; result: AttemptResult }[];
  checks: ProofCheck[];
  /** Checks the trail lead accepted it without. Missing when none, so older proofs and digests read as they did. */
  waived?: ProofWaived[];
  /**
   * Checks the change was outside of (their `paths`), not run. Missing when none, so older proofs and digests read as
   * they did.
   */
  outOfScope?: ProofOutOfScope[];
  /** Checks that passed only on retry. Missing when none, so older proofs and digests read as they did. */
  retried?: ProofRetried[];
  /** What the check guard found: the work changed what its checks run. Missing when it found nothing. */
  guard?: ProofGuard;
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
  /** The diff rules the changes matched. Missing when none did, so older proofs and digests read as they did. */
  rules?: ProofRule[];
  /** `sha256:` of the canonical JSON of every other field. */
  digest: string;
}
