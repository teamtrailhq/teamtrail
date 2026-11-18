import type { TicketMerge, TrailChecksState, TrailRun, TrailTogether } from '../model/trailChecks';

const at = (run?: TrailRun) => (run?.commit ? ` at ${run.commit.slice(0, 7)}` : '');

/** A done ticket's work that won't reach the default branch as it stands: closed without merging, or reverted. */
const notLanded = (merges: TicketMerge[]) => merges.some((m) => m.state === 'closed' || m.state === 'reverted');

/** Closed and reverted work in words, as the combined run's waiting reason says it. */
function notLandedReason(merges: TicketMerge[]): string {
  const label = (m: TicketMerge) => (m.pr !== undefined ? `PR #${m.pr}` : m.key);
  const of = (st: TicketMerge['state']) => merges.filter((m) => m.state === st).map(label);
  const reverted = of('reverted');
  const closed = of('closed');
  return [
    ...(reverted.length ? [`${reverted.join(', ')} ${reverted.length === 1 ? 'is' : 'are'} reverted on main`] : []),
    ...(closed.length ? [`${closed.join(', ')} closed without merging`] : []),
  ].join('; ');
}

/**
 * Whether the trail was verified together, for `trailDone` (pure): only a passed run for every merge counts. Unless
 * a run passed or is running, a done ticket's work that closed without merging or was reverted means the trail's
 * work hasn't landed (`not-landed`), with or without checks on main.
 */
export function trailTogether(state: TrailChecksState, run?: TrailRun, merges: TicketMerge[] = []): TrailTogether {
  if (state.kind !== 'passed' && state.kind !== 'running' && notLanded(merges))
    return { kind: 'not-landed', reason: notLandedReason(merges) };
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
