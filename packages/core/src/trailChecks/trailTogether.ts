import type { TrailChecksState, TrailRun, TrailTogether } from '../model/trailChecks';

const at = (run?: TrailRun) => (run?.commit ? ` at ${run.commit.slice(0, 7)}` : '');

/** Whether the trail was verified together, for `trailDone` (pure): only a passed run for every merge counts. */
export function trailTogether(state: TrailChecksState, run?: TrailRun): TrailTogether {
  switch (state.kind) {
    case 'passed':
      if (run?.commit) return { kind: 'passed', commit: run.commit, branch: run.branch, runId: run.id };
      return { kind: 'pending', reason: 'The run on main named no commit.' };
    case 'failed': {
      const verb = state.failing.length === 1 ? 'fails' : 'fail';
      const reason = `${state.failing.join(', ')} ${verb} on ${run?.branch ?? 'main'}${at(run)} after merging`;
      return { kind: 'failed', reason, runId: run?.id ?? '' };
    }
    case 'running':
      return { kind: 'pending', reason: 'checks running on main after merging' };
    case 'due':
      return { kind: 'pending', reason: 'checks run on main next' };
    case 'off':
    case 'waiting':
    case 'unavailable':
      return { kind: 'pending', reason: state.reason.replace(/\.$/, '') };
    default: {
      const never: never = state;
      return never;
    }
  }
}
