import { callerKey } from './callerKey';

/** Wrong typed codes one caller may send in a minute; then its typed codes wait until the minute is over. */
export const WRONG_CODES_PER_MINUTE = 5;
/** Wrong typed codes all other devices together may send in a minute; then device pairing waits for everyone. */
export const WRONG_CODES_FROM_DEVICES = 20;
const WINDOW_MS = 60_000;
/** Callers remembered at once; past that the oldest are forgotten. */
const MAX_CALLERS = 1000;
const DEVICES = 'all devices';

/**
 * Counts wrong typed codes, per caller (callerKey.ts: loopback is one, an IPv6 device its /64) and for all other
 * devices together. A typed code has about 39 bits and lives five minutes, so these budgets leave nothing to find,
 * even from many addresses. Only input shaped like a typed code counts and is held back: a link's 256-bit code
 * can't be guessed and is never held, and empty or malformed input is simply refused. Devices together can hold
 * back only device pairing, never this machine's (its budget is its own) and never a link the CLI printed.
 */
export function pairAttempts() {
  const wrong = new Map<string, number[]>();
  const recent = (key: string, now: number) => {
    const list = (wrong.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    wrong.set(key, list);
    if (wrong.size > MAX_CALLERS) wrong.delete(wrong.keys().next().value as string);
    return list;
  };
  const until = (key: string, limit: number, now: number) => {
    const list = recent(key, now);
    return list.length >= limit ? list[list.length - limit] + WINDOW_MS : undefined;
  };
  return {
    /** When `who` may send a typed code again, or undefined while it may. */
    lockedUntil(who: string, now = Date.now()): number | undefined {
      const key = callerKey(who);
      const own = until(key, WRONG_CODES_PER_MINUTE, now);
      if (own || key === 'loopback') return own;
      return until(DEVICES, WRONG_CODES_FROM_DEVICES, now);
    },
    failed(who: string, now = Date.now()) {
      const key = callerKey(who);
      recent(key, now).push(now);
      if (key !== 'loopback') recent(DEVICES, now).push(now);
    },
  };
}
