import type { MainChecksView } from '@teamtrail/core';

/** How `main` shows at the start of the trail: needs your choice, held up, passing, running or not run; none if off. */
export type MainMarkTone = 'needs' | 'attention' | 'passed' | 'running' | 'neutral';

/**
 * Checks on main as the map's `main` marker: red while the queue asks you to choose how the trail goes on (or they
 * fail and nobody is fixing them), amber while held up, a check when they pass. Nothing while they're off.
 */
export function mainTone(view: MainChecksView | undefined, asked: boolean): MainMarkTone | undefined {
  if (!view || view.state.kind === 'off') return undefined;
  if (asked) return 'needs';
  switch (view.state.kind) {
    case 'failed':
      return view.state.fixing || view.state.moved ? 'attention' : 'needs';
    case 'unavailable':
    case 'accepted':
      return 'attention';
    case 'passed':
      return 'passed';
    case 'running':
      return 'running';
    case 'not-run':
      return 'neutral';
    default: {
      const never: never = view.state;
      return never;
    }
  }
}
