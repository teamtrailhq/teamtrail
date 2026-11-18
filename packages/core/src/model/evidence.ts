/** What git shows of a worktree at one moment. Paths are relative to `toplevel`, with `/` separators. */
export interface GitTreeState {
  /** Worktree root, resolved through symlinks. */
  toplevel: string;
  /** `null` before the first commit. */
  head: string | null;
  /** `null` when HEAD is detached. */
  branch: string | null;
  /** `sha256:<hex>` over the uncommitted diff and the untracked files; the tracker folder is left out. */
  fingerprint: string;
  /** Files that differ from HEAD (or are untracked): their content hash, `null` when deleted. */
  dirty: Record<string, string | null>;
}

/** The worktree as a claim found it: `<tracker>/.evidence/<mapId>/<ticketId>/baseline-<n>.json`, written once. */
export interface GitBaseline {
  v: 1;
  id: string;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  agent: string;
  sessionId?: string;
  at: number;
  /** `null` outside a git repo (or without git): checks still run, stale detection is off. */
  git: GitTreeState | null;
  /** Why `git` is null. */
  note?: string;
  /** `configHash` of verification.json at claim; absent when there was no file. */
  configHash?: string;
}

export interface ChangedFile {
  path: string;
  /** Lines added and removed since the baseline head; `null` for binary files, or when git cannot tell. */
  add: number | null;
  del: number | null;
  untracked?: true;
  /** Already dirty at claim and edited since: the counts include the edits that predate the claim. */
  dirtyAtClaim?: true;
}

export type EvidenceFlagKind =
  | 'no-git'
  | 'no-baseline'
  | 'no-changes'
  | 'overlap'
  | 'shared-worktree'
  | 'branch-switch'
  | 'history-rewritten'
  | 'config-changed'
  | 'stale'
  | 'outside-scope'
  | 'in-scope'
  | 'check-guard';

/** Something a human should know about a completion. `effect` is what it does to the attempt, if anything. */
export interface EvidenceFlag {
  kind: EvidenceFlagKind;
  level: 'info' | 'warn' | 'alert';
  message: string;
  /** `fail`: the attempt fails (rework). `human`: the ticket goes to blocked for a human. */
  effect?: 'fail' | 'human';
  files?: string[];
  /** Keys of the other tickets involved (overlap). */
  tickets?: string[];
}

/** Git facts of one completion, stored on the attempt and compared later to detect stale verification. */
export interface GitEvidence {
  v: 1;
  /** Id of the baseline the changes are counted from. */
  baseline?: string;
  base?: { head: string | null; branch: string | null };
  /** The worktree at completion; absent outside git. */
  tree?: Omit<GitTreeState, 'dirty'>;
  changed: ChangedFile[];
  stats: { files: number; add: number; del: number };
  configHash?: string;
  flags: EvidenceFlag[];
}

export interface StaleCheck {
  /** False when there is nothing to compare (no git, or no evidence). */
  checked: boolean;
  stale: boolean;
  reason?: string;
}
