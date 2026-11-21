import { type AuditDecision, buildDecision } from '@teamtrail/core';
import { describe, expect, test } from 'vitest';
import { decisionLabel } from '../src/features/decisions/decisionLabel';
import { keptKey } from '../src/features/decisions/keptKey';
import { splitForReview } from '../src/features/decisions/reviewQueue';
import { labelParts } from '../src/lib/labelParts';

const decision = (id: string, over: Partial<AuditDecision> = {}): AuditDecision => ({
  ...buildDecision(id, 'm1', {
    question: 'How should conflict logs be stored?',
    answer: 'Store conflict logs as JSON lines, not a table.',
    decidedBy: 'codex-01',
    source: { kind: 'agent' },
    ticketId: '12',
    ticketKey: '#12',
    decidedAt: new Date('2026-11-20T08:14:00').getTime(),
  }),
  ...over,
});

describe("the Logbook's agents-decided review", () => {
  const agent = decision('D-23');
  const human = decision('D-21', { decidedBy: 'trail lead', source: { kind: 'lookout' } });
  const relayed = decision('D-20', { decidedBy: 'trail lead', source: { kind: 'agent' } });
  const replaced = decision('D-17', { supersededBy: 'D-21' });
  const teammate = decision('D-9@mona', { postedBy: 'mona' });
  const fromText = decision('D-8', { derived: true });
  const all = [agent, human, relayed, replaced, teammate, fromText];

  test("asks only for an agent's own call still in force", () => {
    const { review, ledger } = splitForReview(all, () => false);
    expect(review.map((d) => d.id)).toEqual(['D-23']);
    expect(ledger.map((d) => d.id)).toEqual(['D-21', 'D-20', 'D-17', 'D-9@mona', 'D-8']);
  });

  test('a call this person kept moves to the ledger, in its place', () => {
    const kept = new Set([keptKey(agent)]);
    const { review, ledger } = splitForReview(all, (k) => kept.has(k));
    expect(review).toEqual([]);
    expect(ledger[0].id).toBe('D-23');
  });

  test("kept keys are the Hands-off home's: trail/decision", () => {
    expect(keptKey(agent)).toBe('m1/D-23');
  });
});

describe("a ledger row's label line", () => {
  const shown = (d: AuditDecision, who: string, kept?: boolean) =>
    labelParts(decisionLabel({ d, who, time: '08:14', kept }));

  test("an agent's call names the agent in blaze, with risk and time", () => {
    const d = decision('D-23', { risk: { level: 'low', categories: [] } as unknown as AuditDecision['risk'] });
    expect(shown(d, 'codex-01')).toEqual([
      { text: 'D-23', tone: 'plain' },
      { text: '#12', tone: 'plain' },
      { text: 'codex-01', tone: 'agent' },
      { text: 'low risk', tone: 'plain' },
      { text: '08:14', tone: 'plain' },
    ]);
  });

  test("the trail lead's own call reads You, or the signed-in person's name", () => {
    const mine = decision('D-21', { decidedBy: 'trail lead', source: { kind: 'lookout' } });
    expect(shown(mine, 'trail lead')[2]).toEqual({ text: 'You', tone: 'plain' });
    const named = decision('D-22', {
      decidedBy: 'trail lead',
      decidedByName: 'Alex Rivera',
      source: { kind: 'lookout' },
    });
    expect(shown(named, 'Alex Rivera (trail lead)')[2]).toEqual({ text: 'Alex Rivera', tone: 'plain' });
  });

  test('a kept call says so in green; a call read from text keeps its unverified name', () => {
    expect(shown(decision('D-15'), 'codex-01', true).at(-1)).toEqual({ text: 'kept by you', tone: 'ok' });
    const text = decision('D-8', { derived: true, decidedBy: 'trail lead (unverified, from text)' });
    expect(shown(text, 'trail lead (unverified, from text)')[2]).toEqual({
      text: 'trail lead (unverified, from text)',
      tone: 'plain',
    });
  });
});
