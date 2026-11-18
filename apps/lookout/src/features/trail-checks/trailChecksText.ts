import type { TrailChecksState, TrailChecksView, TrailRun } from '@teamtrail/core';
import type { EdgeTone, MetaPart } from '../../components/ui';
import { ago } from '../../lib';

/** One row of the trail's checks on main together: the three levels of the presenting-data rules. */
export interface TrailChecksRowText {
  edge: EdgeTone;
  title: string;
  context: MetaPart[];
  detail?: string;
}

/** Where a run ran: the branch and commit (unless the title says them), the runner, and when it finished. */
function where(run: TrailRun, now: number, titled = false): MetaPart[] {
  return [
    ...(titled ? [] : [run.branch ?? 'main']),
    ...(run.commit && !titled ? [{ text: run.commit.slice(0, 7), code: true }] : []),
    ...(run.runner ? [`by ${run.runner}`] : []),
    ago(now - (run.finishedAt ?? run.startedAt)),
  ];
}

function stateText(state: TrailChecksState, run?: TrailRun): Omit<TrailChecksRowText, 'context'> {
  switch (state.kind) {
    case 'off':
      return { edge: 'neutral', title: 'Checks on main together are off', detail: state.reason };
    case 'waiting':
      return { edge: 'neutral', title: 'Checks on main run once everything is merged', detail: state.reason };
    case 'due':
    case 'running':
      return { edge: 'neutral', title: 'Running the checks on main with every merge' };
    case 'passed':
      return { edge: 'neutral', title: `Verified together on ${run?.branch ?? 'main'} at ${run?.commit?.slice(0, 7)}` };
    case 'failed': {
      const verb = state.failing.length === 1 ? 'fails' : 'fail';
      return { edge: 'urgent', title: `${state.failing.join(', ')} ${verb} on main with every merge` };
    }
    case 'unavailable':
      return { edge: 'attention', title: "Checks on main together couldn't run", detail: state.reason };
    default: {
      const never: never = state;
      return never;
    }
  }
}

/** States the latest run decides: its commit and time go with them. */
const VERDICTS: TrailChecksState['kind'][] = ['passed', 'failed', 'running', 'unavailable'];
const RESULT = { pass: 'passed', fail: 'failed', running: 'running', unavailable: "couldn't run" };

/** The latest run under a trail it doesn't decide: a Run now before everything merged, or an earlier run. */
function runContext(view: TrailChecksView, now: number): MetaPart[] {
  const run = view.run;
  if (!run) return [];
  if (VERDICTS.includes(view.state.kind)) return where(run, now, view.state.kind === 'passed');
  const when = run.complete ? '' : ', before everything was merged';
  return [`Last run ${RESULT[run.result]}${when}`, ...where(run, now)];
}

/** What the trail's checks on main together row says. */
export function trailChecksText(view: TrailChecksView, now: number): TrailChecksRowText {
  const s = stateText(view.state, view.run);
  return { edge: s.edge, title: s.title, context: runContext(view, now), ...(s.detail ? { detail: s.detail } : {}) };
}
