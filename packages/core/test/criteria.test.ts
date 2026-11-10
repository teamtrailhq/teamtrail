import { describe, expect, it } from 'vitest';
import {
  checkCriteria,
  criteriaRequired,
  numbered,
  parseCriteria,
  serializeCriteria,
  uncoveredRules,
  type CheckResult,
} from '../src';

const check = (name: string, exitCode: number): CheckResult => ({
  name,
  argv: ['x'],
  cwd: '.',
  exitCode,
  timedOut: false,
  durationMs: 1,
  log: '',
  tail: '',
  truncated: false,
});

describe('acceptance criteria', () => {
  const crit = numbered([
    { text: 'Search matches release titles', kind: 'unit' },
    { text: 'Never show another team’s notes', kind: 'business-rule', source: 'K-3' },
    { text: 'The owner approves the copy', kind: 'manual' },
  ]);

  it('number and round-trip through the trail file', () => {
    expect(crit.map((c) => c.id)).toEqual(['AC-1', 'AC-2', 'AC-3']);
    const tickets = [
      { ticketId: '12', ticketKey: '#12', criteria: crit, confirmed: true },
      { ticketId: '14', ticketKey: '#14', criteria: numbered([{ text: 'Works offline', kind: 'e2e' }]) },
    ];
    expect(parseCriteria(serializeCriteria('Search', tickets))).toEqual(tickets);
  });

  it('match evidence: missing, failed or skipped checks, manual sign-off, stated tests', () => {
    const r = checkCriteria(
      crit,
      [
        { id: 'AC-1', evidence: 'check:test' },
        { id: 'AC-3', evidence: 'manual' },
      ],
      [check('test', 0)],
    );
    expect(r).toMatchObject({ missing: ['AC-2'], failed: [], manual: ['AC-3'] });
    expect(r.lines[0]).toBe('AC-1 ✓ check:test · Search matches release titles');
    const failing = checkCriteria(crit.slice(0, 1), [{ id: 'AC-1', evidence: 'check:test' }], [check('test', 1)]);
    expect(failing.failed).toEqual(['AC-1']);
    const notRun = checkCriteria(crit.slice(0, 1), [{ id: 'AC-1', evidence: 'check:e2e' }], [check('test', 0)]);
    expect(notRun.lines[0]).toContain("didn't run");
    const stated = checkCriteria(
      crit.slice(1, 2),
      [{ id: 'AC-2', evidence: 'test:workspace isolation', note: 'scoped' }],
      [],
    );
    // A stated test is the agent's word: claimed, not verified. On a business rule the human signs it off.
    expect(stated).toMatchObject({ missing: [], failed: [], claimed: ['AC-2'] });
    expect(stated.lines[0]).toMatch(/^AC-2 \? claimed, not verified: test:workspace isolation/);
  });

  it('are required for implementation tickets on trails with a brief and verification on', () => {
    expect(criteriaRequired(true, 'execute', 'checks')).toBe(true);
    expect(criteriaRequired(true, 'research', 'checks')).toBe(false);
    expect(criteriaRequired(false, 'execute', 'checks')).toBe(false);
    expect(criteriaRequired(true, 'task', 'off')).toBe(false);
  });

  it('show which business rules no criterion covers yet', () => {
    expect(uncoveredRules(crit, ['K-3', 'K-5'])).toEqual(['K-5']);
  });
});
