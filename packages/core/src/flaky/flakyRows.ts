import type { FlakyCheckRow } from '../model/flaky';
import type { CheckResult, VerificationAttempt } from '../model/verification';
import { failingTestName } from './failingTestName';
import { codeOf } from './retriedChecks';

const passed = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/** One ticket's attempts, as the flaky list reads them. */
export interface FlakyTicket {
  key: string;
  attempts: VerificationAttempt[];
}

/** One check on one code of one ticket: whether it passed, whether it failed, and when it last ran. */
interface Runs {
  name: string;
  passed: boolean;
  failed: boolean;
  test?: string;
  last: number;
}

/** A ticket's runs of each check, per code they ran on: interrupted attempts and unknown code left out. */
function runsOf(attempts: VerificationAttempt[]): Runs[] {
  const runs = new Map<string, Runs>();
  for (const a of attempts) {
    const code = codeOf(a);
    if (!code || a.result === 'interrupted') continue;
    for (const c of a.checks) {
      const id = JSON.stringify([code, c.name, c.cwd, c.argv]);
      const r = runs.get(id) ?? { name: c.name, passed: false, failed: false, last: 0 };
      const ok = passed(c);
      r.passed ||= ok;
      r.failed ||= !ok;
      r.test ??= ok ? undefined : failingTestName(c.tail);
      r.last = Math.max(r.last, a.finishedAt);
      runs.set(id, r);
    }
  }
  return [...runs.values()];
}

/**
 * The project's flaky checks: each check (and its failing test, when the output names one) that both failed and
 * passed on the same code within a ticket, with how often, on which tickets and when last. Pure and deterministic;
 * most recently seen first, then by name.
 */
export function flakyRows(tickets: FlakyTicket[]): FlakyCheckRow[] {
  const rows = new Map<string, FlakyCheckRow>();
  for (const t of tickets)
    for (const r of runsOf(t.attempts)) {
      if (!r.passed || !r.failed) continue;
      const id = JSON.stringify([r.name, r.test ?? null]);
      const row = rows.get(id) ?? {
        name: r.name,
        ...(r.test ? { test: r.test } : {}),
        count: 0,
        tickets: [],
        lastSeen: 0,
      };
      row.count += 1;
      if (!row.tickets.includes(t.key)) row.tickets.push(t.key);
      row.lastSeen = Math.max(row.lastSeen, r.last);
      rows.set(id, row);
    }
  return [...rows.values()].sort((x, y) => y.lastSeen - x.lastSeen || x.name.localeCompare(y.name));
}
