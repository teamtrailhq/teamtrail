import type { VerificationAttempt } from './verification';

/**
 * Escapes: work Teamtrail verified that later came back. The one number that says whether "verified" means anything.
 * Derived on read from the journal, the evidence and git (scorecard/findEscapes.ts); nothing is stored.
 */
export type EscapeKind = 'reopened' | 'reverted';

/** One verified completion that came back, with what shows it. */
export interface Escape {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  kind: EscapeKind;
  /** When it came back: the reopen, or the revert commit's date. */
  at: number;
  /** The passing attempt it came back from. */
  attemptId: string;
  verifiedAt: number;
  /** What shows it, in plain words: who reopened it and why, or the revert commit. */
  evidence: string;
  /** The revert commit, for `reverted`. */
  commit?: string;
  /** The files the verified attempt changed, repo-relative. */
  files: string[];
  /** Checks that passed on the verified attempt: they didn't catch it. */
  checks: string[];
  /** Who made the verified attempt. */
  agent: string;
  sessionId?: string;
}

/** A commit on the default branch that says `This reverts commit <sha>`, with what it reverted as git knows it. */
export interface RevertCommit {
  sha: string;
  /** Committer date, epoch ms. */
  at: number;
  /** The commit it reverts, as its message names it. */
  reverts: string;
  /** That commit's parents (a merge commit has two), when git still has it. */
  revertedParents: string[];
  /** That commit's subject, for a squash merge's `(#12)` or a `Merge pull request #12`. */
  revertedSubject?: string;
}

/** One ticket's record, as escapes are found from it. */
export interface EscapeTicket {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  /** Oldest first. */
  attempts: VerificationAttempt[];
  /** The pull request linked to the ticket, from the PR sync or an attempt. */
  pr?: number;
}
