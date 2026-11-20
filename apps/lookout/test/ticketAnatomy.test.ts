import type { Proof } from '@teamtrail/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UncoveredRules } from '../src/features/criteria/UncoveredRules';
import { chipsOfTicket } from '../src/features/inspector/chipsOfTicket';
import { workToProve } from '../src/features/proof/workToProve';

const proof = (patch: Partial<Proof> = {}) =>
  ({
    status: 'not-verified',
    gaps: ['No completion was submitted for this ticket.'],
    attempt: { id: '' },
    ...patch,
  }) as unknown as Proof;
const done = { state: 'closed', closeReason: 'completed' } as const;

describe('chipsOfTicket', () => {
  it('says the map card’s words: key, type, state, the agent at work and its model', () => {
    const chips = chipsOfTicket({
      key: '#22',
      type: 'execute',
      state: 'claimed',
      agent: { name: 'codex-01', model: 'GPT-5 Codex', modelId: 'gpt-5-codex', working: true },
    });
    expect(chips.map((c) => [c.kind, c.text, c.tone])).toEqual([
      ['key', '#22', undefined],
      ['type', 'Execute', undefined],
      ['state', 'working', 'agent'],
      ['agent', 'codex-01', 'agent'],
      ['model', 'GPT-5 Codex', undefined],
    ]);
  });

  it('marks done work verified or not, and a risk above low, never in red', () => {
    const chips = chipsOfTicket({
      key: '#21',
      type: 'execute',
      state: 'decided',
      proof: { verified: true },
      risk: { level: 'high', reason: 'D-7: schema' },
    });
    expect(chips.slice(2).map((c) => [c.text, c.tone])).toEqual([
      ['done', undefined],
      ['verified', 'verified'],
      ['high risk', 'warn'],
    ]);
    expect(chips.some((c) => c.tone === 'urgent')).toBe(false);
    const low = chipsOfTicket({ key: '#1', type: 'task', state: 'held', risk: { level: 'low', reason: '' } });
    expect(low.map((c) => c.text)).toEqual(['#1', 'Task', 'blocked']);
  });
});

describe('workToProve', () => {
  it('a research ticket closed by a decision has nothing to prove; done implementation work does', () => {
    expect(workToProve({ ...done, type: 'research' }, proof())).toBe(false);
    expect(workToProve({ ...done, type: 'execute' }, proof())).toBe(true);
    expect(
      workToProve({ state: 'open', closeReason: '', type: 'research' }, proof({ attempt: { id: 'A-1' } } as never)),
    ).toBe(true);
  });
});

describe('UncoveredRules', () => {
  it('names the knowledge by its key, its title on hover, never cut mid-sentence in the line', () => {
    const title = 'Product context: PadelEye is a fixed-camera padel analytics proof. apps/web is a read-only, local';
    const out = renderToStaticMarkup(createElement(UncoveredRules, { rules: [{ id: 'K-1', title }] }));
    expect(out.replace(/<[^>]+>/g, '')).toBe('No criterion covers knowledge K-1 yet');
    expect(out).toContain(`data-tip="${title}"`);
  });
});
