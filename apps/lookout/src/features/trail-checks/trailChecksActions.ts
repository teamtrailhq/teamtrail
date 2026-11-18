import type { TrailChecksView } from '@teamtrail/core';
import type { MenuItem } from '../../components/ui';

export interface TrailChecksRunners {
  run: () => void;
  fixTicket: (runId: string) => void;
}

/** The buttons on screen and the "⋯" menu. */
export interface TrailChecksActions {
  buttons: MenuItem[];
  menu: MenuItem[];
}

const runAgain = (r: TrailChecksRunners): MenuItem => ({
  id: 'run',
  label: 'Run again',
  tip: 'Run the approved checks on the default branch with every merge now',
  onSelect: r.run,
});

const runNow = (r: TrailChecksRunners): MenuItem => ({
  id: 'run-now',
  label: 'Run now on main as it is',
  tip: "Before everything is merged: shows what fails on main today. It doesn't verify the trail",
  onSelect: r.run,
});

/** What the trail lead can do about the trail's checks on main together now. */
export function trailChecksActions(view: TrailChecksView, r: TrailChecksRunners): TrailChecksActions {
  const { state, run } = view;
  switch (state.kind) {
    case 'off':
    case 'due':
    case 'running':
      return { buttons: [], menu: [] };
    case 'failed': {
      const fix: MenuItem = {
        id: 'fix-ticket',
        label: 'Add a fix ticket',
        tip: 'A task on this trail with the failing checks and their output, for agents to pick up',
        onSelect: () => run && r.fixTicket(run.id),
      };
      return { buttons: [fix, runAgain(r)], menu: [] };
    }
    case 'unavailable':
      return { buttons: [runAgain(r)], menu: [] };
    case 'passed':
      return { buttons: [], menu: [runAgain(r)] };
    case 'waiting':
      return { buttons: [], menu: [runNow(r)] };
    default: {
      const never: never = state;
      return never;
    }
  }
}
