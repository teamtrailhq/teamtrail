import type { ChecksOutcome } from './runChecks';

/**
 * A completion from an agent connected over HTTP from another machine. Its changes aren't in this checkout, so
 * running the checks or reading git here would be evidence about someone else's code. Nothing runs: the attempt
 * says so and the ticket goes to the human, who reviews the branch or pull request and approves, or pulls the
 * work and re-runs the checks here.
 */
export const REMOTE_COMPLETION_NOTE =
  "Completed by a remote agent: its changes aren't in this checkout, so no check ran and no git evidence was read. Review its branch or pull request and approve, or pull the work here and re-run the checks.";

export const remoteOutcome = (): ChecksOutcome => ({ checks: [], result: 'error', note: REMOTE_COMPLETION_NOTE });
