import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from '../src/model/types';
import type { VerificationAttempt, VerificationVerdict } from '../src/model/verification';
import { buildProof, proofMarkdown } from '../src/node';

const ticket = { mapId: 'm1', id: '6', key: '#6', title: 'Free shipping at checkout', type: 'execute' };

function attempt(over: Partial<VerificationAttempt> = {}): VerificationAttempt {
  return {
    v: 1,
    id: 'a2',
    mapId: 'm1',
    ticketId: '6',
    ticketKey: '#6',
    agent: 'claude-01',
    sessionId: 's1',
    origin: 'local:1',
    level: 'checks+review',
    configHash: 'h',
    submittedAt: 1_000,
    finishedAt: 2_000,
    resolution: 'Free shipping from $50 after discounts',
    pr: 12,
    checks: [
      {
        name: 'tests',
        argv: ['npm', 'test'],
        cwd: '.',
        exitCode: 0,
        timedOut: false,
        durationMs: 1234,
        log: 'x.log',
        tail: '',
        truncated: false,
      },
    ],
    result: 'pass',
    criteria: {
      lines: ['AC-1 ✓ check:tests', 'AC-2 ~ claimed: manual check'],
      missing: [],
      failed: [],
      manual: [],
      claimed: ['AC-2'],
      confirmed: true,
      evidence: [
        { id: 'AC-1', evidence: 'check:tests' },
        { id: 'AC-2', evidence: 'manual check' },
      ],
    },
    git: {
      v: 1,
      base: { head: 'aaaaaaaa1111', branch: 'main' },
      tree: { head: 'bbbbbbbb2222', branch: 'teamtrail/m1/6' } as NonNullable<VerificationAttempt['git']>['tree'],
      changed: [],
      stats: { files: 2, add: 30, del: 4 },
      flags: [],
    },
    ...over,
  };
}

function verdict(over: Partial<VerificationVerdict> = {}): VerificationVerdict {
  return {
    v: 1,
    id: 'v1',
    mapId: 'm1',
    ticketId: '6',
    attemptId: 'a2',
    by: 'codex-01',
    byKind: 'agent',
    sessionId: 's2',
    origin: 'local:2',
    verdict: 'PASS',
    summary: 'Threshold applied after discounts, tests cover it.',
    findings: [],
    at: 3_000,
    ...over,
  };
}

const decision = {
  id: 'D-2',
  mapId: 'm1',
  summary: 'The $50 counts after discounts',
  decidedBy: 'trail lead',
  decidedAt: Date.UTC(2026, 10, 13, 23, 45),
} as DecisionRecord;

const proofOf = (attempts: VerificationAttempt[], verdicts: VerificationVerdict[] = [verdict()]) =>
  buildProof({ ticket, trail: 'Free shipping over $50', attempts, verdicts, decisions: [decision] });

describe('buildProof', () => {
  it('verifies a passing attempt reviewed by another agent', () => {
    const p = proofOf([attempt({ id: 'a1', result: 'fail' }), attempt()]);
    expect(p.status).toBe('verified');
    expect(p.gaps).toEqual([]);
    expect(p.earlier).toEqual([{ id: 'a1', result: 'fail' }]);
    expect(p.criteria).toMatchObject({ verified: 1, claimed: 1, confirmed: true });
    expect(p.reviews[0].independent).toBe(true);
    expect(p.git).toMatchObject({ base: 'aaaaaaaa1111', head: 'bbbbbbbb2222', files: 2 });
  });

  it('is deterministic: the same records give the same digest, a change gives another', () => {
    expect(proofOf([attempt()]).digest).toBe(proofOf([attempt()]).digest);
    expect(proofOf([attempt()]).digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(proofOf([attempt({ resolution: 'Something else' })]).digest).not.toBe(proofOf([attempt()]).digest);
  });

  it("doesn't count a review by the author", () => {
    const p = proofOf([attempt()], [verdict({ by: 'claude-01', sessionId: 's1', origin: 'local:1' })]);
    expect(p.status).toBe('not-verified');
    expect(p.gaps).toContain('No independent review passed it.');
  });

  it('only counts verdicts on the latest attempt', () => {
    const p = proofOf([attempt({ id: 'a1' }), attempt({ id: 'a3' })], [verdict({ attemptId: 'a1' })]);
    expect(p.reviews).toEqual([]);
    expect(p.status).toBe('not-verified');
  });

  it('never verifies a remote completion, a failing run or missing criteria', () => {
    expect(proofOf([attempt({ remote: true })]).gaps).toEqual([
      'Submitted from another machine: no check ran here and no git was read.',
    ]);
    expect(proofOf([attempt({ result: 'fail' })]).gaps).toContain("The checks didn't pass (fail).");
    const missing = attempt();
    missing.criteria = { ...missing.criteria!, missing: ['AC-3'] };
    expect(proofOf([missing]).gaps).toContain('Criteria with no evidence: AC-3.');
    expect(buildProof({ ticket, trail: 't', attempts: [], verdicts: [], decisions: [] }).status).toBe('not-verified');
  });

  it("needs the trail lead's approval at the human level", () => {
    const p = proofOf([attempt({ level: 'checks+review+human' })]);
    expect(p.gaps).toEqual(["The trail lead hasn't approved it."]);
    const approved = proofOf(
      [attempt({ level: 'checks+review+human' })],
      [verdict(), verdict({ id: 'v2', by: 'trail lead', byKind: 'trail lead', sessionId: undefined, at: 4_000 })],
    );
    expect(approved.status).toBe('verified');
  });
});

describe('proofMarkdown', () => {
  it('shows what ran, the criteria, the review and the decisions, with the digest in a hidden marker', () => {
    const p = proofOf([attempt()]);
    const text = proofMarkdown(p);
    expect(text.startsWith(`<!-- teamtrail:proof v1 ${p.digest} -->`)).toBe(true);
    expect(text).toContain('### ✅ Verified by Teamtrail');
    expect(text).toContain('`npm test` (exit 0, 1.2s)');
    expect(text).toContain('1 verified by Teamtrail, 1 claimed by the agent:');
    expect(text).toContain('PASS by codex\\-01 (agent, not the author)');
    expect(text).toContain('D\\-2: The $50 counts after discounts, decided by trail lead, 2026-11-13 23:45 UTC');
    expect(text).toContain('aaaaaaaa → bbbbbbbb');
  });

  it('keeps agent text from becoming markup or a fake marker', () => {
    const p = proofOf([
      attempt({ resolution: 'x', agent: '<!-- teamtrail:proof v1 sha256:0 --> [click](http://evil) **bold**' }),
    ]);
    const text = proofMarkdown(p);
    expect(text.match(/<!--/g)).toHaveLength(1);
    expect(text).not.toContain('[click](');
    expect(text).not.toContain('**bold**');
  });

  it('says plainly what is missing when not verified', () => {
    const text = proofMarkdown(proofOf([attempt({ result: 'fail' })], []));
    expect(text).toContain('### ⚠️ Not verified by Teamtrail');
    // Escaped like everything else in the list; GitHub shows it as "(fail)".
    expect(text).toContain("The checks didn't pass \\(fail\\).");
  });
});
