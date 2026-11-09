import type { AttentionItem, AttentionPolicy, AttentionPrefs, FocusHours, FocusState } from '../model/attention';

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Inside the daily focus window, in the machine's local time; `to` before `from` spans midnight. */
function inFocusHours(focus: FocusHours, now: number): boolean {
  const at = new Date(now);
  const minute = at.getHours() * 60 + at.getMinutes();
  const from = minutesOf(focus.from);
  const to = minutesOf(focus.to);
  const overnight = to <= from;
  const inside = overnight ? minute >= from || minute < to : minute >= from && minute < to;
  if (!inside) return false;
  if (!focus.days) return true;
  // After midnight in an overnight window, the window belongs to the day it started.
  const startedYesterday = overnight && minute < to;
  const day = (at.getDay() + (startedYesterday ? 6 : 0)) % 7;
  return focus.days.includes(day);
}

/** When the focus window `now` is in ends: the next time the clock reads `to`. */
function hoursEnd(focus: FocusHours, now: number): number {
  const end = new Date(now);
  end.setHours(Number(focus.to.slice(0, 2)), Number(focus.to.slice(3, 5)), 0, 0);
  if (end.getTime() <= now) end.setDate(end.getDate() + 1);
  return end.getTime();
}

/** Why focus is on or off right now. Focus switched on by hand wins; ending it early pauses the quiet hours. */
export function focusState(prefs: AttentionPrefs, now: number): FocusState {
  const manual = prefs.focusUntil ?? 0;
  if (manual > now) return { kind: 'manual', until: manual };
  if (!prefs.focus || !inFocusHours(prefs.focus, now)) return { kind: 'off' };
  const until = hoursEnd(prefs.focus, now);
  if ((prefs.focusOffUntil ?? 0) > now) return { kind: 'paused', until };
  return { kind: 'hours', until };
}

/** Focus mode switched on by hand, or the daily focus hours: interruptions wait, the queue doesn't. */
export function isFocused(prefs: AttentionPrefs, now: number): boolean {
  const { kind } = focusState(prefs, now);
  return kind === 'manual' || kind === 'hours';
}

/**
 * Whether an item should notify actively (browser notification, Slack message) right now: it scores at
 * or above the team's threshold and the person isn't focusing. Everything else waits in the queue and
 * the digest. `prefs.channel` only says where a notification goes. Teamtrail never answers on anyone's
 * behalf; this only decides when to tap a shoulder.
 */
export function isInterrupting(item: AttentionItem, policy: AttentionPolicy, prefs: AttentionPrefs, now: number) {
  return item.score >= policy.interrupt && !isFocused(prefs, now);
}
