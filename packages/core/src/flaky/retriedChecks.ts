import type { FlakyCheck } from '../model/flaky';
import type { CheckResult, VerificationAttempt } from '../model/verification';
import { failingTestName } from './failingTestName';

const passed = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/** How a check failed, in words. */
function failure(c: CheckResult): string {
  if (c.timedOut) return 'timed out';
  if (c.error) return 'could not run';
  return `exited ${c.exitCode ?? c.signal}`;
}

/**
 * The code an attempt's checks ran on: its commit and a fingerprint of everything uncommitted. Undefined when that
 * isn't known (no git), or when the code changed while the checks ran (a `stale` flag): then no two runs compare.
 */
export function codeOf(a: VerificationAttempt): string | undefined {
  const tree = a.git?.tree;
  if (!tree?.fingerprint) return undefined;
  if (a.git?.flags.some((f) => f.kind === 'stale')) return undefined;
  return `${tree.head ?? ''}|${tree.fingerprint}`;
}

/** The same command: name, argv and folder. A check whose command changed is another check. */
export const sameCheck = (x: CheckResult, y: CheckResult) =>
  x.name === y.name && x.cwd === y.cwd && JSON.stringify(x.argv) === JSON.stringify(y.argv);

/** Attempts whose checks ran to the end: an interrupted run says nothing about the check. */
const finished = (a: VerificationAttempt) => a.result !== 'interrupted';

/**
 * The checks `current` passed that an earlier attempt of the same ticket failed (or timed out, or couldn't start) on
 * the same code: passes a retry got, not a fix. Pure: the same attempts always give the same list, in the order of
 * `current`'s checks, each with the latest earlier failure.
 */
export function retriedChecks(earlier: VerificationAttempt[], current: VerificationAttempt): FlakyCheck[] {
  const code = codeOf(current);
  if (!code || !finished(current)) return [];
  const same = earlier.filter((a) => a.id !== current.id && finished(a) && codeOf(a) === code);
  const out: FlakyCheck[] = [];
  for (const c of current.checks.filter(passed)) {
    const hit = [...same]
      .reverse()
      .map((a) => ({ a, f: a.checks.find((x) => sameCheck(x, c) && !passed(x)) }))
      .find((h) => h.f);
    if (!hit?.f) continue;
    const test = failingTestName(hit.f.tail);
    out.push({
      name: c.name,
      argv: c.argv,
      failedIn: hit.a.id,
      failure: failure(hit.f),
      head: current.git?.tree?.head ?? null,
      ...(test ? { test } : {}),
    });
  }
  return out;
}
