import type { MainRun } from '../model/mainChecks';

/** What a finished run on main found, before it is recorded. */
export type MainRunOutcome = Pick<MainRun, 'commit' | 'branch' | 'checks' | 'note' | 'runner'> & {
  result: Exclude<MainRun['result'], 'running'>;
};
