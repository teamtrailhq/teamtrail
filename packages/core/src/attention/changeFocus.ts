import type { AttentionPrefs, FocusChange } from '../model/attention';
import { focusState } from './focus';

/**
 * The prefs after a change from the focus control. Focusing for a while sets `focusUntil`; ending focus clears it
 * and, inside quiet hours, pauses them until they would have ended (`focusOffUntil`); resuming clears both, so the
 * quiet hours hold again. Pure: the same prefs, change and time give the same result.
 */
export function changeFocus(prefs: AttentionPrefs, change: FocusChange, now: number): AttentionPrefs {
  const rest = { ...prefs };
  delete rest.focusUntil;
  delete rest.focusOffUntil;
  switch (change.kind) {
    case 'for':
      return { ...rest, focusUntil: now + change.minutes * 60_000 };
    case 'resume':
      return rest;
    case 'end': {
      const state = focusState(rest, now);
      return state.kind === 'hours' ? { ...rest, focusOffUntil: state.until } : rest;
    }
    default: {
      const never: never = change;
      return never;
    }
  }
}
