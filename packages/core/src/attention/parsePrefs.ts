import type { AttentionPrefs, FocusHours, NotifyChannel } from '../model/attention';
import { DEFAULT_ATTENTION_PREFS } from './defaults';
import type { Parsed } from './parsePolicy';

const CHANNELS: NotifyChannel[] = ['browser', 'slack-dm', 'slack-channel', 'none'];
const KEYS = ['v', 'focus', 'focusUntil', 'focusOffUntil', 'channel'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parseFocus(raw: unknown, errors: string[]): FocusHours | undefined {
  if (!isObject(raw)) {
    errors.push('"focus" must be { from: "HH:MM", to: "HH:MM", days? }');
    return undefined;
  }
  const { from, to, days } = raw;
  const bad = (v: unknown) => typeof v !== 'string' || !TIME.test(v);
  if (bad(from) || bad(to)) {
    errors.push('"focus.from" and "focus.to" must be HH:MM');
    return undefined;
  }
  const dayList = Array.isArray(days) ? days : undefined;
  if (days !== undefined && !dayList?.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    errors.push('focus.days must be numbers from 0 (Sunday) to 6 (Saturday)');
    return { from: from as string, to: to as string };
  }
  return { from: from as string, to: to as string, ...(dayList ? { days: dayList as number[] } : {}) };
}

/** One person's attention preferences; also validates what the Lookout PUTs. */
export function parseAttentionPrefs(raw: unknown): Parsed<AttentionPrefs> {
  const errors: string[] = [];
  if (!isObject(raw)) return { value: DEFAULT_ATTENTION_PREFS, errors: ['must be a JSON object'] };
  for (const k of Object.keys(raw)) if (!KEYS.includes(k)) errors.push(`unknown key "${k}"`);
  const value: AttentionPrefs = { ...DEFAULT_ATTENTION_PREFS };
  if (raw.channel !== undefined) {
    if (CHANNELS.includes(raw.channel as NotifyChannel)) value.channel = raw.channel as NotifyChannel;
    else errors.push(`"channel" must be one of ${CHANNELS.join(', ')}`);
  }
  if (raw.focus !== undefined) {
    const focus = parseFocus(raw.focus, errors);
    if (focus) value.focus = focus;
  }
  if (raw.focusUntil !== undefined) {
    if (typeof raw.focusUntil === 'number' && Number.isFinite(raw.focusUntil)) value.focusUntil = raw.focusUntil;
    else errors.push('"focusUntil" must be a time in epoch milliseconds');
  }
  if (raw.focusOffUntil !== undefined) {
    const ok = typeof raw.focusOffUntil === 'number' && Number.isFinite(raw.focusOffUntil);
    if (ok) value.focusOffUntil = raw.focusOffUntil as number;
    else errors.push('"focusOffUntil" must be a time in epoch milliseconds');
  }
  return { value, errors };
}
