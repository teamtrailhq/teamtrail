import { describe, expect, it } from 'vitest';
import { failureSignature, sameSignature, signatureOf } from '../src/mainChecks/failureSignature';
import { mainChecksState } from '../src/mainChecks/mainChecksState';
import type { MainRun, TrailMainChoices } from '../src/model/mainChecks';

const NONE: TrailMainChoices = { known: [], dropped: [] };
const plan = { kind: 'run' as const, hash: 'h1' };

function run(over: Partial<MainRun> = {}): MainRun {
  return {
    v: 1,
    id: 'M-1',
    commit: 'a'.repeat(40),
    branch: 'main',
    startedAt: 1,
    finishedAt: 2,
    configHash: 'h1',
    by: 'Teamtrail',
    result: 'fail',
    checks: [
      { name: 'lint', argv: ['lint'], passed: true, exitCode: 0, timedOut: false, durationMs: 1, tail: '' },
      {
        name: 'test',
        argv: ['test'],
        passed: false,
        exitCode: 1,
        timedOut: false,
        durationMs: 1,
        tail: 'FAIL a',
        signature: ['FAIL a'],
      },
    ],
    ...over,
  };
}

describe('failure signatures', () => {
  it('keep the lines that name a failure, without what changes from run to run', () => {
    const out =
      '\u001b[31mFAIL\u001b[0m /tmp/wt-1/src/a.test.ts > renders (12ms)\nall good here\nTests 1 failed | 40 passed';
    expect(failureSignature(out, ['/tmp/wt-1'])).toEqual([
      'FAIL <repo>/src/a.test.ts > renders (#ms)',
      'Tests # failed | # passed',
    ]);
  });
  it('match only when nothing new fails', () => {
    const main = signatureOf('FAIL a\nTests 1 failed');
    expect(sameSignature(main, signatureOf('FAIL a\nTests 2 failed'))).toBe(true);
    expect(sameSignature(main, signatureOf('FAIL a\nFAIL b\nTests 2 failed'))).toBe(false);
    expect(sameSignature(main, [])).toBe(false);
  });
  it('fall back to the last lines when the output names no failure', () => {
    expect(signatureOf('building\nexit status 2')).toEqual(['last: building', 'last: exit status #']);
  });
});

describe('where checks on main stand for a trail', () => {
  it('hold implementation while the first run is due or running, unless the trail lead starts anyway', () => {
    expect(mainChecksState({ plan, ready: true, choices: NONE }).holds).toBe(true);
    const running = run({ result: 'running', finishedAt: undefined, checks: [] });
    expect(mainChecksState({ plan, ready: true, run: running, choices: NONE }).holds).toBe(true);
    const proceed = { ...NONE, proceed: { at: 1, by: 'trail lead', runId: 'M-1' } };
    const going = mainChecksState({ plan, ready: true, run: running, choices: proceed });
    expect(going).toEqual({ state: { kind: 'running', proceeding: true }, holds: false });
  });

  it('hold nothing before the trail is ready, while checks are off, or when nothing could run', () => {
    expect(mainChecksState({ plan, ready: false, run: run(), choices: NONE }).holds).toBe(false);
    const off = mainChecksState({ plan: { kind: 'off', reason: 'none' }, ready: true, choices: NONE });
    expect(off).toEqual({ state: { kind: 'off', reason: 'none' }, holds: false });
    const unavailable = run({ result: 'unavailable', note: 'no git', checks: [] });
    expect(mainChecksState({ plan, ready: true, run: unavailable, choices: NONE }).holds).toBe(false);
  });

  it('take a run made with other checks as no run', () => {
    expect(
      mainChecksState({ plan: { kind: 'run', hash: 'h2' }, ready: true, run: run(), choices: NONE }).state,
    ).toEqual({
      kind: 'not-run',
    });
  });

  it('accept a failure that is dropped or known, also on a later run that fails the same way', () => {
    const dropped = { ...NONE, dropped: [{ name: 'test', at: 1, by: 'trail lead', runId: 'M-1' }] };
    expect(mainChecksState({ plan, ready: true, run: run(), choices: dropped }).state).toEqual({
      kind: 'accepted',
      known: [],
      dropped: ['test'],
    });
    const known = {
      ...NONE,
      known: [{ name: 'test', runId: 'M-0', commit: null, exitCode: 1, signature: ['FAIL a'] }],
    };
    expect(mainChecksState({ plan, ready: true, run: run(), choices: known }).holds).toBe(false);
    const other = run({ checks: [{ ...run().checks[1], signature: ['FAIL b'] }] });
    expect(mainChecksState({ plan, ready: true, run: other, choices: known }).state).toEqual({
      kind: 'failed',
      failing: ['test'],
      fixing: false,
    });
  });
});
