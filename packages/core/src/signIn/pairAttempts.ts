/** Wrong typed codes one caller may send in a minute; then its typed codes wait until the minute is over. */
export const WRONG_CODES_PER_MINUTE = 5;
const WINDOW_MS = 60_000;
/** Callers remembered at once; past that the oldest are forgotten. */
const MAX_CALLERS = 1000;

/**
 * Counts wrong typed codes, per caller: this machine (every loopback connection) is one, each other address its
 * own. A typed code has about 39 bits and lives five minutes, so five guesses a minute leave nothing to find. Only
 * input shaped like a typed code counts and is held back: a link's 256-bit code can't be guessed and is never
 * held, and empty or malformed input is simply refused. So no one can lock the human out of pairing: not another
 * device (it has its own budget), and not a local program (the CLI's links are never held).
 */
export function pairAttempts() {
  const wrong = new Map<string, number[]>();
  const recent = (who: string, now: number) => {
    const list = (wrong.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
    wrong.set(who, list);
    if (wrong.size > MAX_CALLERS) wrong.delete(wrong.keys().next().value as string);
    return list;
  };
  return {
    /** When `who` may send a typed code again, or undefined while it may. */
    lockedUntil(who: string, now = Date.now()): number | undefined {
      const list = recent(who, now);
      return list.length >= WRONG_CODES_PER_MINUTE ? list[0] + WINDOW_MS : undefined;
    },
    failed(who: string, now = Date.now()) {
      recent(who, now).push(now);
    },
  };
}
