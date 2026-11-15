import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from '../src/model/types';
import type { VerificationAttempt } from '../src/model/verification';
import { decisionMemory } from '../src/precedent/decisionMemory';
import { findPrecedents } from '../src/precedent/findPrecedents';
import { precedentConflicts } from '../src/precedent/precedentConflicts';
import { wordOverlap } from '../src/precedent/wordOverlap';

function decision(over: Partial<DecisionRecord>): DecisionRecord {
  return {
    id: 'D-2',
    mapId: 'm',
    ticketId: '3',
    question: 'Does the $50 threshold count before or after discounts?',
    answer: 'After discounts.',
    summary: 'The $50 counts after discounts',
    alternatives: [],
    rationale: '',
    decidedBy: 'trail lead',
    decidedAt: 100,
    participants: [],
    source: { kind: 'hitl' },
    transcript: [],
    risk: { level: 'high', category: 'billing', reason: 'billing is high risk' },
    ...over,
  } as DecisionRecord;
}

const areas = new Map([['m/D-2', ['src/pricing/shipping.ts', 'src/pricing/discounts.ts']]]);

describe('findPrecedents', () => {
  it('is strong for the same files and risk category, and says why', () => {
    const found = findPrecedents({
      query: { text: 'Free shipping rule?', categories: ['billing'], paths: ['src/pricing/cart.ts'] },
      decisions: [decision({})],
      areas,
    });
    expect(found).toMatchObject([
      { id: 'D-2', strength: 'strong', reasons: ['billing, and it touches src/pricing/cart.ts'] },
    ]);
  });

  it('only suggests on wording or another category, and never returns a superseded decision', () => {
    const q = { text: 'Should the $50 threshold count after discounts?', categories: ['schema' as const] };
    expect(findPrecedents({ query: q, decisions: [decision({})] })[0]).toMatchObject({ strength: 'suggested' });
    expect(findPrecedents({ query: q, decisions: [decision({ supersededBy: 'D-5' })] })).toEqual([]);
    expect(findPrecedents({ query: { text: 'Which font?' }, decisions: [decision({})] })).toEqual([]);
  });

  it('is strong when the agent names the decision', () => {
    const [p] = findPrecedents({ query: { text: 'x', relatesTo: ['D-2'] }, decisions: [decision({})] });
    expect(p).toMatchObject({ strength: 'strong', reasons: ['you named D-2'] });
  });
});

describe('wordOverlap', () => {
  it('compares meaningful words only, deterministically', () => {
    expect(wordOverlap('Does the cart total include tax?', 'Is tax included in the cart total?')).toBeCloseTo(0.75);
    expect(wordOverlap('', 'anything')).toBe(0);
  });
});

describe('precedentConflicts', () => {
  const attempt = (over: Partial<VerificationAttempt>) =>
    ({
      v: 1,
      id: 'A-1',
      mapId: 'm',
      ticketId: '7',
      ticketKey: '#7',
      agent: 'codex-01',
      level: 'checks',
      configHash: 'h',
      submittedAt: 200,
      finishedAt: 210,
      resolution: 'done',
      checks: [],
      result: 'pass',
      git: { v: 1, changed: [{ path: 'src/pricing/discounts.ts' }], stats: { files: 1, add: 1, del: 0 }, flags: [] },
      ...over,
    }) as VerificationAttempt;

  it("flags later verified work that changed a file the human's decision covers", () => {
    const found = precedentConflicts({ attempts: [attempt({})], decisions: [decision({})], areas });
    expect(found).toMatchObject([{ ticketKey: '#7', decisionId: 'D-2', files: ['src/pricing/discounts.ts'] }]);
  });

  it("ignores failed work, earlier work, the decision's own ticket, agents' decisions and superseded ones", () => {
    const d = decision({});
    const none = (attempts: VerificationAttempt[], decisions: DecisionRecord[]) =>
      expect(precedentConflicts({ attempts, decisions, areas })).toEqual([]);
    none([attempt({ result: 'fail' })], [d]);
    none([attempt({ submittedAt: 50 })], [d]);
    none([attempt({ ticketId: '3' })], [d]);
    none([attempt({})], [decision({ decidedBy: 'claude-04' })]);
    none([attempt({})], [decision({ supersededBy: 'D-9' })]);
  });
});

describe('decisionMemory', () => {
  it('gives each decision its folder and the later decisions that cite it', () => {
    const later = decision({ id: 'D-7', ticketId: '9', decidedAt: 300, rationale: 'Same rule as D-2.' });
    const replaces = decision({ id: 'D-8', decidedAt: 400, supersedes: 'D-2', question: 'q', summary: 's' });
    const unrelated = decision({ id: 'D-21', decidedAt: 500, risk: undefined, question: 'D-21 font', summary: 'x' });
    const m = decisionMemory([decision({}), later, replaces, unrelated], areas);
    expect(m.get('m/D-2')).toEqual({ area: 'src/pricing/', citedBy: ['D-7', 'D-8'] });
    expect(m.get('m/D-7')?.area).toBe('billing');
    expect(m.get('m/D-21')).toEqual({ area: 'No area yet', citedBy: [] });
  });
});
