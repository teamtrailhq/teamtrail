/**
 * Lines that name one failing test, as common runners print them:
 * - vitest and jest: `FAIL  test/auth.test.ts > login > keeps the session`
 * - node:test and other TAP: `not ok 3 - keeps the session`
 * - pytest: `FAILED tests/test_auth.py::test_login - AssertionError`
 * - mocha and vitest's tree: `× keeps the session 12ms`, `✗ …`, `✕ …`
 */
const PATTERNS: RegExp[] = [
  /^\s*FAIL\s+(.+?)\s*$/,
  /^\s*not ok \d+ - (.+?)\s*$/,
  /^\s*FAILED\s+(\S+)/,
  /^\s*[×✗✕]\s+(.+?)(?:\s+\d+(?:\.\d+)?\s?m?s)?\s*$/,
];

const MAX = 200;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * The failing test a check's output names, when it names exactly one: deterministic, no guessing. Runners print a
 * failure in more than one form (a tree line and a summary line), so the first form that matches any line decides.
 * Undefined when the output names none, or several different tests.
 */
export function failingTestName(tail: string): string | undefined {
  const lines = tail.split('\n').map((l) => l.replace(ANSI, ''));
  for (const p of PATTERNS) {
    const names = new Set(lines.map((l) => l.match(p)?.[1]?.trim().slice(0, MAX)).filter((n): n is string => !!n));
    if (names.size) return names.size === 1 ? [...names][0] : undefined;
  }
  return undefined;
}
