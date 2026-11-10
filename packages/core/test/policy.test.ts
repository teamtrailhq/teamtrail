import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  decisionsByRisk,
  parseDecision,
  parsePolicy,
  policyViolations,
  riskLevelFor,
  serializeDecision,
  serializePolicy,
  type DecisionRecord,
  type VerificationAttempt,
} from '../src';

const t0 = Date.UTC(2026, 10, 4);

function attempt(ticketId: string, paths: string[], patch: Partial<VerificationAttempt> = {}): VerificationAttempt {
  return {
    v: 1,
    id: 'A-1',
    mapId: 'm1',
    ticketId,
    ticketKey: `#${ticketId}`,
    agent: 'claude-01',
    level: 'checks',
    configHash: 'h',
    submittedAt: t0,
    finishedAt: t0,
    resolution: 'done',
    checks: [],
    result: 'pass',
    git: {
      v: 1,
      changed: paths.map((path) => ({ path, add: 1, del: 0 })),
      stats: { files: paths.length, add: paths.length, del: 0 },
      flags: [],
    },
    ...patch,
  };
}

function decision(id: string, patch: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id,
    mapId: 'm1',
    question: 'Q',
    answer: 'A',
    summary: 'A',
    alternatives: [],
    rationale: '',
    decidedBy: 'claude-01',
    decidedAt: t0,
    participants: [],
    source: { kind: 'agent' },
    transcript: [],
    ...patch,
  };
}

describe('policy file', () => {
  it('keeps default levels for categories it leaves out, and round-trips', () => {
    const { policy, errors } = parsePolicy(JSON.stringify({ v: 1, categories: { dependencies: 'low' } }));
    expect(errors).toEqual([]);
    expect(policy?.categories.dependencies).toBe('low');
    expect(policy?.categories.schema).toBe('high');
    expect(policy?.paths).toEqual(DEFAULT_POLICY.paths);
    expect(parsePolicy(serializePolicy(policy!)).policy).toEqual(policy);
  });

  it('reports every problem and gives no policy', () => {
    const { policy, errors } = parsePolicy(
      JSON.stringify({
        v: 2,
        extra: true,
        categories: { schema: 'urgent', vibes: 'low' },
        paths: [{ glob: '', level: 'high' }, { glob: 'a/**', level: 'high', category: 'x', note: 'n' }, 'bad'],
      }),
    );
    expect(policy).toBeUndefined();
    expect(errors).toEqual([
      '"v" must be 1',
      'unknown key "extra"',
      'categories.schema must be one of low, medium, high',
      expect.stringMatching(/^unknown category "vibes"/),
      'paths[0].glob must be a non-empty path glob',
      'paths[1].category is not a known category',
      'paths[1]: unknown note',
      'paths[2] must be an object',
    ]);
    expect(parsePolicy('{').errors[0]).toMatch(/^not valid JSON/);
    expect(parsePolicy('[]').errors).toEqual(['must be a JSON object']);
    expect(parsePolicy(JSON.stringify({ v: 1, paths: {} })).errors).toEqual([
      '"paths" must be a list of { glob, level, category? }',
    ]);
  });
});

describe('riskLevelFor', () => {
  it('takes the highest of the category and matching paths, with the reason', () => {
    expect(riskLevelFor({}, DEFAULT_POLICY)).toBeUndefined();
    expect(riskLevelFor({ category: 'dependencies' }, DEFAULT_POLICY)).toEqual({
      level: 'medium',
      category: 'dependencies',
      reason: 'dependencies is medium risk',
    });
    expect(riskLevelFor({ category: 'dependencies', paths: ['db/migrations/0003.sql'] }, DEFAULT_POLICY)).toEqual({
      level: 'high',
      category: 'schema',
      reason: 'db/migrations/0003.sql matches **/migrations/** (high)',
    });
    expect(riskLevelFor({ paths: ['src/ui/Button.tsx'] }, DEFAULT_POLICY)).toEqual({
      level: 'low',
      reason: 'no risky category or path',
    });
  });

  it('keeps the category on a tie', () => {
    const r = riskLevelFor({ category: 'schema', paths: ['x/migrations/1.sql'] }, DEFAULT_POLICY);
    expect(r).toEqual({ level: 'high', category: 'schema', reason: 'schema is high risk' });
  });
});

describe('policyViolations', () => {
  it('flags the latest completion that touched high-risk files without the human', () => {
    const attempts = [
      attempt('1', ['src/a.ts', 'db/migrations/1.sql'], { id: 'A-1', submittedAt: t0 }),
      attempt('1', ['src/a.ts'], { id: 'A-2', submittedAt: t0 + 10 }),
      attempt('2', ['src/auth/session.ts', 'src/auth/token.ts'], { submittedAt: t0 + 5 }),
      attempt('3', ['db/migrations/2.sql']),
      attempt('4', ['package.json']),
      attempt('5', ['db/migrations/3.sql']),
    ];
    const decisions = [
      // The human's decisions and answers cover a rule only in the category they were made in.
      decision('D-1', {
        ticketId: '3',
        decidedBy: 'trail lead',
        risk: { level: 'high', category: 'schema', reason: 'r' },
      }),
      decision('D-2', { ticketId: '4' }),
      decision('D-3', { ticketId: '2' }),
    ];
    const found = policyViolations({
      attempts,
      decisions,
      policy: DEFAULT_POLICY,
      covered: [{ mapId: 'm1', ticketId: '5', category: 'schema' }],
    });
    expect(found).toEqual([
      expect.objectContaining({
        ticketId: '2',
        paths: ['src/auth/session.ts', 'src/auth/token.ts'],
        globs: ['**/auth/**'],
        reason: 'claude-01 changed 2 files matching **/auth/** without asking you',
      }),
    ]);
  });
});

describe('decision risk', () => {
  it('round-trips through the decision file, and old files have none', () => {
    const d = decision('D-7', {
      risk: { level: 'medium', category: 'dependencies', reason: 'dependencies is medium risk' },
    });
    expect(parseDecision(serializeDecision(d)).risk).toEqual(d.risk);
    expect(parseDecision(serializeDecision(decision('D-8'))).risk).toBeUndefined();
  });

  it('groups decisions riskiest first', () => {
    const groups = decisionsByRisk([
      decision('D-1'),
      decision('D-2', { risk: { level: 'low', reason: 'r' } }),
      decision('D-3', { risk: { level: 'medium', reason: 'r' } }),
    ]);
    expect(groups.map((g) => [g.label, g.decisions.map((d) => d.id)])).toEqual([
      ['Medium risk', ['D-3']],
      ['Low risk', ['D-2']],
      ['No category', ['D-1']],
    ]);
  });
});
