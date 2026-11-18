import type { MainRun } from '../model/mainChecks';

/** What a finished run on main found, before it is recorded. */
export type MainRunOutcome = Pick<MainRun, 'commit' | 'branch' | 'checks' | 'note' | 'runner'> & {
  result: Exclude<MainRun['result'], 'running'>;
  /** For a trail's combined run on a runner: the commits asked for that the runner says its commit contains. */
  contains?: string[];
};
