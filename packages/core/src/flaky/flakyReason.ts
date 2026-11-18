import type { FlakyCheck } from '../model/flaky';

const onCode = (head: string | null) => (head ? `on ${head.slice(0, 7)}` : 'on the same code');

/** One flaky check in words: "npm test (auth > login) failed, then passed on abc1234 with no change". */
export const flakyLine = (f: FlakyCheck) =>
  `${f.name}${f.test ? ` (${f.test})` : ''} ${f.failure === 'timed out' ? 'timed out' : 'failed'} in ${f.failedIn}, then passed ${onCode(f.head)} with no change`;

/** Every flaky check of an attempt, in one line. */
export const flakyReason = (checks: FlakyCheck[]) => checks.map(flakyLine).join('; ');
