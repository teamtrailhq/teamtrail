import { describe, expect, it } from 'vitest';
import { changeFocus, focusState, isFocused, parseAttentionPrefs, type AttentionPrefs } from '../src';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime(); // Nov 2026, local time
const base: AttentionPrefs = { v: 1, channel: 'browser' };
const overnight: AttentionPrefs = { ...base, focus: { from: '18:00', to: '09:00' } };

describe('focus state', () => {
  it('says why focus is on or off, and until when', () => {
    expect(focusState(base, at(2, 10))).toEqual({ kind: 'off' });
    expect(focusState({ ...base, focusUntil: at(2, 11) }, at(2, 10))).toEqual({ kind: 'manual', until: at(2, 11) });
    expect(focusState(overnight, at(2, 22))).toEqual({ kind: 'hours', until: at(3, 9) });
    expect(focusState(overnight, at(3, 7))).toEqual({ kind: 'hours', until: at(3, 9) });
    expect(focusState(overnight, at(3, 10))).toEqual({ kind: 'off' });
  });

  it('ends focus early inside quiet hours by pausing them until they would have ended', () => {
    const ended = changeFocus(overnight, { kind: 'end' }, at(2, 22));
    expect(ended.focusOffUntil).toBe(at(3, 9));
    expect(focusState(ended, at(2, 23))).toEqual({ kind: 'paused', until: at(3, 9) });
    expect(isFocused(ended, at(2, 23))).toBe(false);
    // The next evening the quiet hours hold again on their own.
    expect(focusState(ended, at(3, 19))).toEqual({ kind: 'hours', until: at(4, 9) });
    expect(focusState(changeFocus(ended, { kind: 'resume' }, at(2, 23)), at(2, 23)).kind).toBe('hours');
  });

  it('focuses for a while, and ends manual focus without touching the quiet hours', () => {
    const on = changeFocus(base, { kind: 'for', minutes: 60 }, at(2, 10));
    expect(on.focusUntil).toBe(at(2, 11));
    expect(changeFocus(on, { kind: 'end' }, at(2, 10, 30))).toEqual(base);
    const onAtNight = changeFocus(overnight, { kind: 'for', minutes: 60 }, at(2, 22));
    expect(focusState(onAtNight, at(2, 22, 30)).kind).toBe('manual');
    expect(changeFocus(onAtNight, { kind: 'end' }, at(2, 22, 30)).focusOffUntil).toBe(at(3, 9));
  });

  it('keeps the pause in the person prefs file format', () => {
    expect(parseAttentionPrefs({ v: 1, channel: 'browser', focusOffUntil: 5 }).value.focusOffUntil).toBe(5);
    expect(parseAttentionPrefs({ v: 1, channel: 'browser', focusOffUntil: 'x' }).errors).toEqual([
      '"focusOffUntil" must be a time in epoch milliseconds',
    ]);
  });
});
