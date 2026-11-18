/**
 * Pull request and CI evidence for a ticket, read from a code host (GitHub
 * today) by the reconciler. Everything here is a derived cache: it raises
 * flags for the trail lead and never changes ticket state.
 *
 * Text copied from a pull request (title, branch and check names) is
 * untrusted: anyone who can open a PR writes it. It is sanitized and capped,
 * shown as plain text, and never put into agent instructions.
 */

export type PrState = 'open' | 'merged' | 'closed';

/** Latest review per reviewer, folded: any change request wins over approvals. */
export type PrReview = 'approved' | 'changes_requested' | 'commented' | 'none';

/** GitHub computes mergeability lazily; `unknown` until it has. */
export type PrMergeable = 'clean' | 'conflicting' | 'unknown';

/** A CI check on the PR head. `UNKNOWN` (missing, or a result Teamtrail cannot read) is never a pass. */
export type CheckState = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';

export interface CiCheck {
  name: string;
  state: CheckState;
  /** Counts toward the PR's CI result: listed in `github.requiredChecks`, or every check when that list is empty. */
  required: boolean;
  url?: string;
}

/** Required checks folded into one result. `none` means the head has no checks at all. */
export type ChecksSummary = 'passed' | 'failing' | 'pending' | 'unknown' | 'none';

export interface PullRequestSnapshot {
  number: number;
  url: string;
  /** Untrusted, sanitized, at most 120 characters. */
  title: string;
  state: PrState;
  draft: boolean;
  headSha: string;
  /** Untrusted, sanitized. */
  headRef: string;
  /** The head branch lives in the same repository (not a fork). */
  sameRepo: boolean;
  review: PrReview;
  mergeable: PrMergeable;
  updatedAt: number;
  /** The commit a merge put on the base branch (a squash or rebase too); only when merged, '' when GitHub gave none. */
  mergeCommit?: string;
}

/** A recently updated PR with the tickets its body or branch names. The body itself is discarded. */
export interface PrCandidate {
  pr: PullRequestSnapshot;
  /** `<mapId>#<ticketId>` for each `teamtrail:<mapId>#<ticketId>` marker in the body. */
  markers: string[];
}

/**
 * How a ticket found its PR, strongest first: a trail lead link, the PR an
 * agent named in report_completion (kept on its attempt), the branch its
 * latest attempt ran on (git evidence), then a body marker or a
 * `teamtrail-<mapId>-<ticketId>` branch name.
 */
export type PrLinkSource = 'explicit' | 'attempt' | 'branch' | 'marker';

export interface PrLink {
  number: number;
  source: PrLinkSource;
  at: number;
}

export type SyncFlagKind =
  | 'done-pr-open'
  | 'pr-merged-not-done'
  | 'pr-closed-unmerged'
  | 'required-checks-failing'
  | 'checks-unknown'
  | 'pr-head-not-verified';

export interface SyncFlag {
  kind: SyncFlagKind;
  severity: 'alert' | 'warn';
  text: string;
  /** First tick that raised it; kept while it stays raised. */
  since: number;
}

/**
 * `.evidence/<mapId>/<ticketId>/sync.json`: the last PR/CI snapshot and open flags. Rewritten when a tick changes it;
 * how fresh it is is the reconciler's (PrSyncStatus `lastOkAt`).
 */
export interface TicketSync {
  v: 1;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  provider: string;
  link: PrLink;
  pr?: PullRequestSnapshot;
  checks: CiCheck[];
  checksSummary: ChecksSummary;
  flags: SyncFlag[];
  /** The tick that last changed this snapshot; every ok tick since read it the same (PrSyncStatus `lastOkAt`). */
  syncedAt?: number;
  /** PRs closed without merging that a newer PR for this ticket replaced: never linked again by branch or marker. */
  replaced?: number[];
  /** Set when the last tick failed for this ticket; `pr`, `checks` and `flags` are then from `syncedAt`. */
  error?: string;
}

/**
 * The reconciler's own health (`.evidence/sync-status.json`). `ok` is only
 * written after a tick in which every read succeeded, so a failed sync never
 * shows as synced.
 */
export interface PrSyncStatus {
  state: 'off' | 'ok' | 'failed' | 'rate-limited';
  /** Why it is off or failing. Never contains a token. */
  reason?: string;
  provider?: string;
  /** `owner/name`. */
  repo?: string;
  lastAttemptAt?: number;
  lastOkAt?: number;
  nextAt?: number;
}

/** One line of `.events/flags/<mapId>.jsonl`. */
export interface FlagEntry {
  v: 1;
  kind: 'flag.raised' | 'flag.cleared';
  at: number;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  flag: SyncFlagKind;
  text: string;
}

/** Payload of the SSE `verification` event the reconciler sends (`kind: 'sync'`). */
export interface VerificationSyncEvent {
  kind: 'sync';
  status: PrSyncStatus;
  /** Tickets whose snapshot or flags changed this tick. */
  tickets: TicketSync[];
}

/**
 * A code host or CI service the reconciler reads. Read-only; implementations
 * hold their credential in memory and never return or log it.
 */
export interface CiProvider {
  readonly name: string;
  /** `owner/name` or the provider's equivalent. */
  readonly repo: string;
  /** Open and recently updated PRs, newest first. */
  recent(): Promise<PrCandidate[]>;
  /** PRs whose head is `branch` in this repository. */
  forBranch(branch: string): Promise<PullRequestSnapshot[]>;
  /** One PR, with review and mergeability. */
  pull(n: number): Promise<PullRequestSnapshot>;
  /** Checks on commit `sha`; every name in `required` appears, as `UNKNOWN` when the host has no result for it. */
  checks(sha: string, required: string[]): Promise<CiCheck[]>;
}
