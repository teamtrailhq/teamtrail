/** Wrong codes allowed in a minute, across every address; then pairing waits until the minute is over. */
export const WRONG_CODES_PER_MINUTE = 5;
const WINDOW_MS = 60_000;

/**
 * Counts wrong pairing codes. A typed code has about 39 bits; five guesses a minute, for codes that live five
 * minutes, leave nothing to find. While it is locked even a right code waits, or guessing would go on.
 */
export function pairAttempts() {
  let wrong: number[] = [];
  const recent = (now: number) => (wrong = wrong.filter((t) => now - t < WINDOW_MS));
  return {
    /** When pairing opens again, or undefined while it is open. */
    lockedUntil(now = Date.now()): number | undefined {
      const list = recent(now);
      return list.length >= WRONG_CODES_PER_MINUTE ? list[0] + WINDOW_MS : undefined;
    },
    failed(now = Date.now()) {
      recent(now).push(now);
    },
  };
}
