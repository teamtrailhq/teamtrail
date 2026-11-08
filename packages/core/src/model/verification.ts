import type { CriteriaResult } from '../criteria/criteria';
import type { GitEvidence } from './evidence';
import type { VerificationLevel } from './lifecycle';
import type { ChecklistAnswer } from './role';
import type { TicketType } from './types';

/** One configured command. `run` is an argv array, never a shell string. */
export interface CheckSpec {
  run: string[];
  /** Seconds before the whole process group is killed. */
  timeoutSec: number;
  /** Relative to the repo root; must stay inside it. */
  cwd?: string;
}

/** `.teamtrail/verification.json`: the only source of commands Teamtrail runs. */
export interface VerificationConfig {
  v: 1;
  /** Level for new trails (`checks` when the file leaves it out). Existing trails keep their own level (none means off). */
  default: VerificationLevel;
  /** Ticket types the trail level applies to; decision tickets stay off unless listed. */
  appliesTo: TicketType[];
  checks: Record<string, CheckSpec>;
  /** Checks run on every completion, in order, unless a ticket names its own. */
  run: string[];
  failFast: boolean;
  /** Failed attempts before the ticket is blocked for a human instead of going back to rework. */
  maxAttempts: number;
  totalTimeoutSec: number;
  noChanges: { allow: TicketType[]; else: 'flag' | 'fail' | 'human' };
  stale: 'reverify' | 'flag';
  github: { enabled: 'auto' | 'off'; requiredChecks: string[]; pollSec: number };
}

export interface CheckResult {
  name: string;
  argv: string[];
  cwd: string;
  exitCode: number | null;
  signal?: string;
  timedOut: boolean;
  durationMs: number;
  /** The command could not start (missing binary, bad cwd). */
  error?: string;
  /** Log file, relative to the tracker root. */
  log: string;
  /** Last lines of output, secrets redacted: what the agent and the ticket see. */
  tail: string;
  truncated: boolean;
}

export type AttemptResult = 'pass' | 'fail' | 'error' | 'interrupted';

/** One completion claim and what Teamtrail found. Written once, never rewritten. */
export interface VerificationAttempt {
  v: 1;
  id: string;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  agent: string;
  sessionId?: string;
  level: VerificationLevel;
  configHash: string;
  submittedAt: number;
  finishedAt: number;
  resolution: string;
  summary?: string;
  rationale?: string;
  alternatives?: string[];
  /** The agent's reason no files needed to change. */
  noCodeReason?: string;
  /** The pull request the agent named for this work. */
  pr?: number;
  checks: CheckResult[];
  result: AttemptResult;
  /** Why the result is `error` or `interrupted`. */
  note?: string;
  /** The worktree the checks ran on, the changes since the claim and their flags. */
  git?: GitEvidence;
  /** The ticket's acceptance criteria matched to the evidence the agent gave. */
  criteria?: CriteriaResult;
}

export type VerdictKind = 'PASS' | 'FAIL' | 'NEEDS_HUMAN';

/** A review or a human decision on an attempt. */
export interface VerificationVerdict {
  v: 1;
  id: string;
  mapId: string;
  ticketId: string;
  attemptId: string;
  by: string;
  byKind: 'agent' | 'trail lead';
  sessionId?: string;
  verdict: VerdictKind;
  summary: string;
  findings: { path?: string; line?: number; severity: 'info' | 'warn' | 'error'; text: string }[];
  at: number;
  /** The role the reviewer acted in, when the review ticket had one. */
  role?: { id: string; version: string };
  /** The reviewer's answers to that role's checklist. */
  checklist?: ChecklistAnswer[];
}
