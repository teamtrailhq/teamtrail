import type { FocusChange, FocusState } from '@teamtrail/core';

interface FocusAction {
  label: string;
  change: FocusChange;
  primary?: boolean;
}

const HOUR: FocusAction = { label: 'Focus for 1 hour', change: { kind: 'for', minutes: 60 } };

/** What the focus panel offers in each state: end focus while it's on, start it (or let quiet hours hold) while off. */
export function focusActions(state: FocusState): FocusAction[] {
  switch (state.kind) {
    case 'manual':
    case 'hours':
      return [{ label: 'End focus now', change: { kind: 'end' }, primary: true }];
    case 'paused':
      return [{ label: 'Resume quiet hours', change: { kind: 'resume' }, primary: true }, HOUR];
    case 'off':
      return [
        { ...HOUR, primary: true },
        { label: 'Focus for 3 hours', change: { kind: 'for', minutes: 180 } },
      ];
    default: {
      const never: never = state;
      return never;
    }
  }
}
