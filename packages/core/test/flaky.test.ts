import { describe, expect, it } from 'vitest';
import { failingTestName } from '../src/flaky/failingTestName';
import { flakyRows } from '../src/flaky/flakyRows';
import { retriedChecks } from '../src/flaky/retriedChecks';
import type { CheckResult, VerificationAttempt } from '../src/model/verification';
import { proofGaps } from '../src/proof/proofGaps';
import { outcomeOf } from '../src/verification/outcome';

const check = (o: Partial<CheckResult> & { ok?: boolean } = {}): CheckResult => ({
  name: 'test',
  argv: ['npm', 'test'],
  cwd: '.',
  exitCode: o.ok === false ? 1 : 0,
  timedOut: false,
  durationMs: 1,
  log: '',
  tail: '',
  truncated: false,
  ...o,
});

let n = 0;
function attempt(o: {
  checks: CheckResult[];
  head?: string;
  fp?: string;
  result?: VerificationAttempt['result'];
  stale?: boolean;
  at?: number;
}): VerificationAttempt {
  n += 1;
  return {
    v: 1,
    id: `A-${n}`,
    mapId: 'm',
    ticketId: '1',
    ticketKey: '#1',
    agent: 'Scout-1',
    level: 'checks',
    configHash: 'h',
    submittedAt: 0,
    finishedAt: o.at ?? n,
    resolution: 'r',
    checks: o.checks,
    result: o.result ?? (o.checks.every((c) => c.exitCode === 0 && !c.timedOut) ? 'pass' : 'fail'),
    git: {
      v: 1,
      tree: { toplevel: '/r', head: o.head ?? 'abc1234567', branch: 'main', fingerprint: o.fp ?? 'sha256:clean' },
      changed: [],
      stats: { files: 0, add: 0, del: 0 },
      flags: o.stale ? [{ kind: 'stale', level: 'warn', message: 'changed' }] : [],
    },
  };
}

describe('failingTestName', () => {
  it('names the one failing test a runner prints', () => {
    expect(failingTestName(' FAIL  test/a.test.ts > login > keeps the session\n')).toBe(
      'test/a.test.ts > login > keeps the session',
    );
    expect(failingTestName('ok 1 - a\nnot ok 2 - keeps the session\n')).toBe('keeps the session');
    expect(failingTestName('FAILED tests/test_a.py::test_login - AssertionError')).toBe('tests/test_a.py::test_login');
    expect(failingTestName('  × keeps the session 12ms')).toBe('keeps the session');
    expect(failingTestName('\x1b[31mnot ok 2 - colored\x1b[0m')).toBe('colored');
  });

  it('names nothing when several tests failed or none is named', () => {
    expect(failingTestName('not ok 1 - a\nnot ok 2 - b')).toBeUndefined();
    expect(failingTestName('Error: boom')).toBeUndefined();
  });
});

describe('retriedChecks', () => {
  it('finds a pass after a failure on the same code', () => {
    const a1 = attempt({ checks: [check({ ok: false, tail: 'not ok 1 - x' })] });
    const a2 = attempt({ checks: [check()] });
    expect(retriedChecks([a1], a2)).toEqual([
      { name: 'test', argv: ['npm', 'test'], failedIn: a1.id, failure: 'exited 1', head: 'abc1234567', test: 'x' },
    ]);
  });

  it('counts a timeout as a failure', () => {
    const a1 = attempt({ checks: [check({ timedOut: true, exitCode: null })] });
    expect(retriedChecks([a1], attempt({ checks: [check()] }))[0].failure).toBe('timed out');
  });

  it('ignores interrupted runs, other code, another command and runs whose code changed while they ran', () => {
    const pass = () => attempt({ checks: [check()] });
    const fail = (o: object = {}) => attempt({ checks: [check({ ok: false })], ...o });
    expect(retriedChecks([fail({ result: 'interrupted' })], pass())).toEqual([]);
    expect(retriedChecks([fail({ fp: 'sha256:dirty' })], pass())).toEqual([]);
    expect(retriedChecks([fail({ head: 'def' })], pass())).toEqual([]);
    expect(retriedChecks([fail({ stale: true })], pass())).toEqual([]);
    const other = attempt({ checks: [check({ ok: false, argv: ['npm', 'test', '--', '-x'] })] });
    expect(retriedChecks([other], pass())).toEqual([]);
  });

  it('is nothing without git', () => {
    const a1 = attempt({ checks: [check({ ok: false })] });
    const a2 = { ...attempt({ checks: [check()] }), git: undefined };
    expect(retriedChecks([a1], a2)).toEqual([]);
  });
});

describe('flakyRows', () => {
  it('counts each check that flipped on unchanged code, latest first', () => {
    const t1 = [
      attempt({ checks: [check({ ok: false, tail: 'not ok 1 - x' })], at: 10 }),
      attempt({ checks: [check()], at: 20 }),
    ];
    const t2 = [
      attempt({ checks: [check({ name: 'lint', argv: ['lint'] })], head: 'h2', at: 30 }),
      attempt({ checks: [check({ name: 'lint', argv: ['lint'], ok: false })], head: 'h2', at: 40 }),
      attempt({ checks: [check({ ok: false })], head: 'h3', at: 50 }),
    ];
    expect(
      flakyRows([
        { key: '#1', attempts: t1 },
        { key: '#2', attempts: t2 },
      ]),
    ).toEqual([
      { name: 'lint', count: 1, tickets: ['#2'], lastSeen: 40 },
      { name: 'test', test: 'x', count: 1, tickets: ['#1'], lastSeen: 20 },
    ]);
  });
});

describe('a pass the check guard and the flaky gate both hold', () => {
  it('waits for the trail lead once, saying both, and its proof has both gaps until accepted', () => {
    const a = attempt({ checks: [check()] });
    const flaky = { name: 'test', argv: ['npm', 'test'], failedIn: 'A-0', failure: 'exited 1', head: 'abc1234567' };
    const finding = { kind: 'script' as const, file: 'package.json', text: 'package.json scripts.test changed' };
    const both: VerificationAttempt = {
      ...a,
      flaky: { mode: 'enforce', checks: [flaky] },
      guard: { mode: 'enforce', findings: [finding] },
    };
    const o = outcomeOf(both, 0, 3);
    expect(o.to).toBe('blocked');
    expect(o.reason).toMatch(/passed, but the work changed what its checks run: .*; and only on retry: test failed/);
    const gaps = proofGaps({ attempt: both, reviews: [] });
    expect(gaps.some((g) => g.includes("hasn't accepted the pass"))).toBe(true);
    expect(gaps.some((g) => g.startsWith('The work changed what its checks run'))).toBe(true);
    const lead = { by: 'trail lead', byKind: 'trail lead' as const, verdict: 'PASS' as const, summary: 'ok' };
    expect(proofGaps({ attempt: both, reviews: [{ ...lead, independent: true }] })).toEqual([]);
  });
});
