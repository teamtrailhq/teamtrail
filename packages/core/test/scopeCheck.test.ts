import { describe, expect, it } from 'vitest';
import { scopeFlag } from '../src/evidence/scopeFlag';
import type { ChangedFile } from '../src/model/evidence';
import type { VerificationAttempt } from '../src/model/verification';
import { buildProof, proofMarkdown } from '../src/node';
import { parseVerificationConfig } from '../src/verification/config';
import { reviewBody } from '../src/verification/reviewRequest';

const files = (...paths: string[]): ChangedFile[] => paths.map((path) => ({ path, add: 1, del: 0 }));

describe('scopeFlag', () => {
  it('says nothing without changes or without declared files', () => {
    expect(scopeFlag({ changed: [], touches: ['src/**'], scope: 'fail' })).toBeUndefined();
    expect(scopeFlag({ changed: files('a.ts'), scope: 'fail' })).toBeUndefined();
    expect(scopeFlag({ changed: files('a.ts'), touches: [], scope: 'fail' })).toBeUndefined();
  });

  it('is info when every change is inside the declared files: globs, and plain folders with what is under them', () => {
    const f = scopeFlag({
      changed: files('src/search/box.tsx', 'src/search/deep/index.ts', 'README.md'),
      touches: ['src/search/', 'README.md'],
      scope: 'fail',
    });
    expect(f).toMatchObject({ kind: 'in-scope', level: 'info' });
    expect(f?.effect).toBeUndefined();
    expect(scopeFlag({ changed: files('src/a/b.ts'), touches: ['src/*/*.ts'], scope: 'flag' })?.kind).toBe('in-scope');
  });

  it('lists the files outside, a warning by default', () => {
    const f = scopeFlag({
      changed: files('src/search/box.tsx', 'src/billing/tax.ts', 'package.json', 'src/searchbar.ts'),
      touches: ['src/search'],
      scope: 'flag',
    });
    expect(f).toMatchObject({
      kind: 'outside-scope',
      level: 'warn',
      files: ['src/billing/tax.ts', 'package.json', 'src/searchbar.ts'],
    });
    expect(f?.message).toBe(
      '3 changed files outside the declared src/search: src/billing/tax.ts, package.json, src/searchbar.ts',
    );
  });

  it("sends the work back, or to a person, as the project's scope says", () => {
    const at = { changed: files('src/a.ts', 'src/b.ts'), touches: ['src/a.ts'] };
    expect(scopeFlag({ ...at, scope: 'fail' })).toMatchObject({ level: 'alert', effect: 'fail' });
    expect(scopeFlag({ ...at, scope: 'fail' })?.message).toContain('claim again with touches that cover them');
    expect(scopeFlag({ ...at, scope: 'human' })).toMatchObject({ level: 'alert', effect: 'human' });
  });
});

describe('verification.json scope', () => {
  it('defaults to flag, and takes flag, fail or human', () => {
    const parse = (scope?: unknown) => parseVerificationConfig(JSON.stringify({ v: 1, ...(scope ? { scope } : {}) }));
    expect(parse().config?.scope).toBe('flag');
    expect(parse('fail').config?.scope).toBe('fail');
    expect(parse('block').errors).toEqual(['"scope" must be flag, fail or human']);
  });
});

function attempt(flags: NonNullable<VerificationAttempt['git']>['flags'], touches?: string[]): VerificationAttempt {
  return {
    v: 1,
    id: 'a1',
    mapId: 'm1',
    ticketId: '6',
    ticketKey: '#6',
    agent: 'claude-01',
    level: 'checks+review',
    configHash: 'h',
    submittedAt: 1_000,
    finishedAt: 2_000,
    resolution: 'Search box',
    checks: [],
    result: 'pass',
    ...(touches ? { touches } : {}),
    git: {
      v: 1,
      base: { head: 'aaaaaaaa1111', branch: 'main' },
      tree: { head: 'bbbbbbbb2222', branch: 'teamtrail/m1/6' } as NonNullable<VerificationAttempt['git']>['tree'],
      changed: files('src/search/box.tsx', 'src/billing/tax.ts'),
      stats: { files: 2, add: 2, del: 0 },
      flags,
    },
  };
}

const ticket = { mapId: 'm1', id: '6', key: '#6', title: 'Search box', type: 'execute' };
const proofOf = (a: VerificationAttempt) =>
  buildProof({ ticket, trail: 'Search', attempts: [a], verdicts: [], decisions: [] });

describe('the scope in the proof and the review', () => {
  const outside = scopeFlag({ ...attempt([]).git!, touches: ['src/search/**'], scope: 'flag' })!;

  it('the proof names the files outside the declared ones, apart from the other flags', () => {
    const p = proofOf(attempt([outside, { kind: 'stale', level: 'warn', message: 'x' }], ['src/search/**']));
    expect(p.git?.flags).toEqual(['stale']);
    expect(p.git?.scope).toEqual({ declared: ['src/search/**'], outside: ['src/billing/tax.ts'] });
    expect(proofMarkdown(p)).toContain(
      '**Scope:** 1 changed file outside the declared src/search/\\*\\*: src/billing/tax.ts.',
    );
  });

  it('says so when everything is inside, and shows nothing for attempts from before the check', () => {
    const inside = { kind: 'in-scope' as const, level: 'info' as const, message: 'all inside' };
    expect(proofMarkdown(proofOf(attempt([inside], ['src/**'])))).toContain(
      '**Scope:** every changed file is inside the declared src/\\*\\*.',
    );
    const old = proofOf(attempt([]));
    expect(old.git?.scope).toBeUndefined();
    expect(proofMarkdown(old)).not.toContain('**Scope:**');
  });

  it('the reviewer starts with the files outside the declared scope', () => {
    const t = { id: '6', key: '#6', title: 'Search box' } as Parameters<typeof reviewBody>[0];
    expect(reviewBody(t, attempt([outside], ['src/search/**']))).toContain(
      'Start with the files changed outside the declared scope',
    );
    expect(reviewBody(t, attempt([]))).not.toContain('outside the declared scope');
  });
});
