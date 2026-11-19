/*
 * Setup steps: the frozen installs `verification.json` names under `setup`, approved with the checks (the same file,
 * the same hash). Teamtrail runs them only in worktrees it prepares (the one checks on main run in, and a claimed
 * ticket's), never in the person's own checkout, and only in the shapes guides/setupArgv.ts knows.
 */

/** One setup step: argv only, in a folder of the repo. */
export interface SetupSpec {
  run: string[];
  /** Relative to the repo root; must stay inside it. */
  cwd?: string;
  timeoutSec: number;
}

/** One setup step as it ran (or was refused). */
export interface SetupStepResult {
  name: string;
  argv: string[];
  cwd: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** The command could not start (missing program, bad folder). */
  error?: string;
  /** Why Teamtrail didn't run it: not a frozen install it knows, or no lockfile in its folder. */
  refused?: string;
  /** Last lines of output, redacted. */
  tail: string;
  /** Log file, relative to the tracker root. */
  log?: string;
}

/** What the setup steps did in one worktree: every step in order up to the first that failed. */
export interface SetupOutcome {
  steps: SetupStepResult[];
  /** One line on the step that failed, when one did: `npm ci in apps/web exited 1`. */
  failed?: string;
}
