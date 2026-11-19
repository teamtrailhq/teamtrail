import type { MainChecksView, MainChoice } from '@teamtrail/core';
import type { MenuItem } from '../../components/ui';

export interface MainChecksRunners {
  choose: (choice: MainChoice) => void;
  run: () => void;
}

/** The buttons on screen and the "⋯" menu: every choice is one click, and each has its undo in the menu. */
export interface MainChecksActions {
  buttons: MenuItem[];
  menu: MenuItem[];
}

const runAgain = (r: MainChecksRunners, label = 'Run checks on main again'): MenuItem => ({
  id: 'run',
  label,
  tip: "Run the approved checks on the default branch's head now",
  onSelect: r.run,
});

function failedActions(failing: string[], r: MainChecksRunners): MainChecksActions {
  const drops = failing.map((check): MenuItem => ({
    id: `drop-${check}`,
    label: `Drop ${check} for this trail`,
    tip: `Completions on this trail stop running ${check}; you can restore it`,
    onSelect: () => r.choose({ kind: 'drop', check }),
  }));
  const fix: MenuItem = {
    id: 'fix-main',
    label: 'Fix main first',
    tip: 'Implementation keeps waiting; run the checks again once main is fixed',
    onSelect: () => r.choose({ kind: 'fix-main' }),
  };
  const proceed: MenuItem = {
    id: 'proceed',
    label: 'Start anyway',
    tip: "Known failures: a completion that fails only in these, the same way, isn't sent back",
    onSelect: () => r.choose({ kind: 'proceed' }),
  };
  return { buttons: [fix, ...drops.slice(0, 1), proceed], menu: [...drops.slice(1), runAgain(r)] };
}

function acceptedMenu(view: MainChecksView, r: MainChecksRunners): MenuItem[] {
  const restores = view.choices.dropped.map((d): MenuItem => ({
    id: `restore-${d.name}`,
    label: `Restore ${d.name} for this trail`,
    onSelect: () => r.choose({ kind: 'restore', check: d.name }),
  }));
  const unmark: MenuItem[] = view.choices.proceed
    ? [{ id: 'unmark', label: 'Unmark known failures', onSelect: () => r.choose({ kind: 'undo-proceed' }) }]
    : [];
  return [runAgain(r), ...restores, ...unmark];
}

/** What the trail lead can do about checks on main now. */
export function mainChecksActions(view: MainChecksView, r: MainChecksRunners): MainChecksActions {
  const { state } = view;
  switch (state.kind) {
    case 'off':
    case 'not-run':
      return { buttons: [], menu: [] };
    case 'running': {
      const wait: MenuItem = { id: 'wait', label: 'Wait for them', onSelect: () => r.choose({ kind: 'undo-proceed' }) };
      const start: MenuItem = {
        id: 'proceed',
        label: 'Start without waiting',
        tip: 'Agents start building now; what fails on main is a known failure',
        onSelect: () => r.choose({ kind: 'proceed' }),
      };
      return state.proceeding ? { buttons: [], menu: [wait] } : { buttons: [start], menu: [] };
    }
    case 'passed':
      return { buttons: [], menu: [runAgain(r)] };
    case 'unavailable':
    case 'environment':
      return { buttons: [runAgain(r, 'Run again')], menu: [] };
    case 'failed': {
      if (!state.fixing) return failedActions(state.failing, r);
      const choose: MenuItem = {
        id: 'choose',
        label: 'Choose again',
        onSelect: () => r.choose({ kind: 'undo-fix-main' }),
      };
      return { buttons: [runAgain(r, 'Run again')], menu: [choose] };
    }
    case 'accepted':
      return { buttons: [], menu: acceptedMenu(view, r) };
    default: {
      const never: never = state;
      return never;
    }
  }
}
