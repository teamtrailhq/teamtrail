import type { ChangedFile } from '../model/evidence';
import type { CheckSpec } from '../model/verification';

/** One check a runner is asked to run: the name and the command as the approved config defines it. */
export interface RunnerCheck {
  name: string;
  spec: CheckSpec;
}

/** What a runner is asked: a remote agent's completion of one ticket, with the approved checks to run. */
export interface CheckRunJob {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  attemptId: string;
  /** In order; run them all within `totalTimeoutSec` (stop at the first failure when `failFast`). */
  checks: RunnerCheck[];
  totalTimeoutSec: number;
  failFast: boolean;
  /** Who is behind the agent (`token:<id>`): the runner finds the agent's work from it. */
  origin?: string;
  /** The pull request the agent named, and the files it says it changed: its word, for the runner to check. */
  pr?: number;
  declaredPaths?: string[];
  signal?: AbortSignal;
}

/** One check as the runner ran it. */
export interface RunnerCheckResult {
  name: string;
  exitCode: number | null;
  signal?: string;
  timedOut: boolean;
  durationMs: number;
  /** The command could not start. */
  error?: string;
  /** The output, or its end: the engine keeps its last lines, redacted, and writes it as the check's log. */
  output: string;
}

/** The runner's report: the checks it ran, on which commit, and what changed there. */
export interface RunnerReport {
  checks: RunnerCheckResult[];
  /** The commit the checks ran on and the base it was compared with; absent when the work couldn't be found. */
  git?: {
    head: string;
    branch: string | null;
    base: { head: string | null; branch: string | null };
    changed: ChangedFile[];
  };
  /** Why nothing could run (no work found, the runner failed): the attempt is then an error for a human. */
  error?: string;
}

/**
 * A check runner an embedding server provides: it runs a remote agent's approved checks where that agent's work is
 * (its pushed commit), since this checkout doesn't hold it. Only the server's own code sets one, never an agent; the
 * engine checks what it reports against what it asked before grading (runnerGraded.ts).
 */
export interface CheckRunner {
  /** Shown on the attempt and the proof: who ran the checks. */
  name: string;
  run(job: CheckRunJob): Promise<RunnerReport>;
}
