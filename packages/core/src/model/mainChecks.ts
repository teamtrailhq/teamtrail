import type { ActorKind } from './lifecycle';

/*
 * Checks on main: the approved checks run once on the default branch's head before agents build on it, so a check
 * that already fails there is known before any completion is blamed for it (mainChecks/).
 */

/** One check as it ran on main. */
export interface MainCheckResult {
  name: string;
  argv: string[];
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  /** The command could not start. */
  error?: string;
  durationMs: number;
  /** Last lines of output, redacted. */
  tail: string;
  /** Log file, relative to the tracker root. */
  log?: string;
  /** The failure's lines, normalized (failureSignature.ts); only for a check that failed. */
  signature?: string[];
}

/** `unavailable`: nothing could run (no git, no default branch, the runner can't run checks on main). */
export type MainRunResult = 'running' | 'pass' | 'fail' | 'unavailable';

/** One run of the approved checks on the default branch. */
export interface MainRun {
  v: 1;
  id: string;
  /** The commit the checks ran on; null when none could be found. */
  commit: string | null;
  branch: string | null;
  startedAt: number;
  finishedAt?: number;
  /** The approved verification.json the checks came from. */
  configHash: string;
  checks: MainCheckResult[];
  result: MainRunResult;
  /** Why it is `unavailable`, or what else to know. */
  note?: string;
  /** The embedding server's runner that ran it, when one did. */
  runner?: string;
  /** Who asked for it: `trail lead`, an agent's claim, or Teamtrail when a trail became ready. */
  by: string;
  /** The process running it, while `running`. */
  pid?: number;
}

/** A check that already failed on main, which the trail lead accepted for a trail: later the same failure is known. */
export interface KnownFailure {
  name: string;
  runId: string;
  commit: string | null;
  exitCode: number | null;
  signature: string[];
}

/** Who chose, and when. */
export interface MainChoiceMark {
  at: number;
  by: string;
  /** The run the choice was made on. */
  runId: string;
}

/** The trail lead's choices about checks on main for one trail, on this machine. */
export interface TrailMainChoices {
  /** Keep waiting until main is fixed. Holds for the run it was made on. */
  fixMain?: MainChoiceMark;
  /** Start anyway: the run's failures are known failures for this trail. */
  proceed?: MainChoiceMark;
  known: KnownFailure[];
  /** Checks taken out of this trail's required checks. */
  dropped: (MainChoiceMark & { name: string })[];
}

/** Where checks on main stand for one trail. */
export type MainChecksState =
  | { kind: 'off'; reason: string }
  | { kind: 'not-run' }
  | { kind: 'running'; proceeding: boolean }
  | { kind: 'passed' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'failed'; failing: string[]; fixing: boolean }
  | { kind: 'accepted'; known: string[]; dropped: string[] };

/** What the Lookout, agents and an embedding server read for one trail. */
export interface MainChecksView {
  mapId: string;
  state: MainChecksState;
  /** The latest run on main, if any. */
  run?: MainRun;
  choices: TrailMainChoices;
  /** Implementation claims wait now; `reason` says why, in words an agent and the human read. */
  holds: boolean;
  reason?: string;
}

/** What the trail lead can do about checks on main for a trail. */
export type MainChoice =
  | { kind: 'fix-main' }
  | { kind: 'proceed' }
  | { kind: 'drop'; check: string }
  | { kind: 'undo-fix-main' }
  | { kind: 'undo-proceed' }
  | { kind: 'restore'; check: string };

/** A run on main asked for, or a choice about it, in the journal. */
export interface MainChecksEntry {
  v: 1;
  kind: 'main-checks';
  at: number;
  mapId: string;
  action: MainChoice['kind'] | 'run';
  /** The run it was about, and the check for drop and restore. */
  runId?: string;
  check?: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** The journal "trail" that holds runs on main asked for outside a trail. */
export const MAIN_CHECKS_JOURNAL = '_main-checks';
