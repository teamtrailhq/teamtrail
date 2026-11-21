import type { MainRun } from '../model/mainChecks';
import { latestMainRun } from './mainRunStore';

/** How often a run another call or process started is read again while waiting for it. */
const POLL_MS = 100;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A run already running, started by another call or process (the Lookout's loop, another agent), once the latest run
 * settles, or as it is after `ms`. Its record is the state: read again until it is no longer running, or its
 * process is gone (latestMainRun reads such a run as never having happened).
 */
export async function runSettledWithin(
  root: string,
  o: { run?: MainRun; budgetMs: number; ms: number },
): Promise<MainRun | undefined> {
  const deadline = Date.now() + o.ms;
  let run = o.run;
  while (run?.result === 'running' && Date.now() < deadline) {
    await pause(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
    run = latestMainRun(root, o.budgetMs);
  }
  return run;
}
