import type { Proof } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { command, duration, proofLines } from '../src/features/proof/proofLines';

const review = (r: Partial<Proof['reviews'][number]>): Proof['reviews'][number] => ({
  by: 'codex-02',
  byKind: 'agent',
  verdict: 'PASS',
  summary: 'fine',
  independent: true,
  ...r,
});

const proof = (p: Partial<Proof>) =>
  ({ checks: [], reviews: [], attempt: { model: 'claude-opus-5-5' }, ...p }) as unknown as Proof;

describe('proofLines', () => {
  it('gives each check its own line with its command and how it went', () => {
    const lines = proofLines(
      proof({
        checks: [
          { name: 'lint', argv: ['npm', 'run', 'lint'], exitCode: 0, durationMs: 1200, passed: true },
          {
            name: 'e2e',
            argv: ['npx', 'playwright', 'test'],
            exitCode: 1,
            durationMs: 9000,
            passed: false,
            knownFailure: true,
          },
          { name: 'test', argv: ['npm', 'test'], exitCode: 2, durationMs: 300, passed: false },
          { name: 'build', argv: ['make'], exitCode: null, durationMs: 0, passed: false },
        ],
      }),
    );
    expect(lines.map((l) => [l.mark, l.name, l.what, l.meta])).toEqual([
      ['done', 'lint', 'npm run lint', '1.2s'],
      ['todo', 'e2e', 'npx playwright test', 'fails on main'],
      ['rework', 'test', 'npm test', 'failed, exit 2'],
      ['rework', 'build', 'make', "didn't start"],
    ]);
  });

  it('adds the checks it went without, a held guard (the only line that holds for you) and its reviews', () => {
    const lines = proofLines(
      proof({
        waived: [{ name: 'test', argv: ['npm', 'test'], by: 'trail lead', reason: 'none yet' }],
        outOfScope: [{ name: 'web', argv: ['npm', 'test', '-w', 'web'], reason: 'changes outside apps/web' }],
        guard: { mode: 'enforce', findings: ['package.json scripts.test changed', 'vitest.config.ts changed'] },
        reviews: [
          review({ model: 'gpt-5.1-codex' }),
          review({ by: 'claude-05', model: 'claude-opus-5-5', sameModel: 'held', independent: false }),
          review({ by: 'codex-03', verdict: 'FAIL' }),
        ],
      }),
    );
    expect(lines.map((l) => [l.mark, l.name, l.what, l.meta, !!l.holds])).toEqual([
      ['todo', 'test', 'npm test', 'skipped by trail lead', false],
      ['todo', 'web', 'npm test -w web', 'not run', false],
      ['held', 'check guard', 'package.json scripts.test changed (+1 more)', 'held', true],
      ['done', 'review', 'codex-02 · GPT-5.1 Codex ≠ author Opus 5.5', 'pass', false],
      ['todo', 'review', 'claude-05 · Opus 5.5 = author Opus 5.5', 'the same model as the author', false],
      ['rework', 'review', 'codex-03', 'fail', false],
    ]);
  });

  it('says an accepted or observed guard without holding anything', () => {
    const accepted = proofLines(
      proof({ guard: { mode: 'enforce', findings: ['x'], accepted: { by: 'Ann', reason: 'ok' } } }),
    );
    const observed = proofLines(proof({ guard: { mode: 'observe', findings: ['x'] } }));
    expect([accepted[0].meta, accepted[0].holds, observed[0].meta, observed[0].holds]).toEqual([
      'accepted by Ann',
      undefined,
      'observed',
      undefined,
    ]);
  });

  it('names a program given by its path by its name', () => {
    expect(command(['/Users/me/.nvm/versions/node/v22/bin/node', 'scripts/test.mjs'])).toBe('node scripts/test.mjs');
    expect(command(['npm', 'test'])).toBe('npm test');
  });

  it('reads durations the way people say them', () => {
    expect([duration(450), duration(1234), duration(123_000)]).toEqual(['450ms', '1.2s', '2m 3s']);
  });
});
