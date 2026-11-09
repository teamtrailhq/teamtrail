import type { AttentionView, FocusState } from '@teamtrail/core';
import { clock } from '../../lib';

/** What the focus control says: the header chip's state and time, and the panel's title, reason and held-back line. */
interface FocusCopy {
  /** "Focus on", "Focus paused" or "Focus off". */
  label: string;
  /** "12:00", when the state ends on its own; empty when off. */
  until: string;
  on: boolean;
  title: string;
  reason: string;
  detail: string;
}

/** A time as the clock on this machine reads it, 24-hour, like the quiet hours. */
const at = (t: number) => clock(t).slice(0, 5);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function heldLine(view: AttentionView) {
  const waiting = `${view.items.length} waiting on you`;
  if (view.heldBack === 0) return `Nothing held back · ${waiting}`;
  return `${plural(view.heldBack, 'item')} would interrupt you · ${waiting}`;
}

function hoursText(view: AttentionView) {
  const hours = view.prefs.focus;
  return hours ? `Quiet hours ${hours.from}–${hours.to}` : 'No quiet hours set';
}

const interruptLine = (view: AttentionView) =>
  `Items scoring ${view.policy.value.interrupt} or more interrupt you · ${view.items.length} waiting on you`;

/** The words for each focus state. */
export function focusCopy(view: AttentionView): FocusCopy {
  const state: FocusState = view.focus;
  switch (state.kind) {
    case 'manual':
    case 'hours': {
      const until = at(state.until);
      const reason = state.kind === 'manual' ? 'Switched on here' : hoursText(view);
      return {
        label: 'Focus on',
        until,
        on: true,
        title: `Focus is on until ${until}`,
        reason,
        detail: heldLine(view),
      };
    }
    case 'paused': {
      const until = at(state.until);
      const title = `Quiet hours paused until ${until}`;
      return { label: 'Focus paused', until, on: false, title, reason: hoursText(view), detail: interruptLine(view) };
    }
    case 'off':
      return {
        label: 'Focus off',
        until: '',
        on: false,
        title: 'Focus is off',
        reason: hoursText(view),
        detail: interruptLine(view),
      };
    default: {
      const never: never = state;
      return never;
    }
  }
}
