import { NODE_W } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { CARD_TEXT_X } from '../src/features/map/cardLayout';
import { layoutChips } from '../src/features/map/layoutChips';

const right = (chips: ReturnType<typeof layoutChips>) => Math.max(...chips.map((c) => c.x + c.w));

describe('layoutChips', () => {
  it('lays a short row out as one chip per part, left to right', () => {
    const chips = layoutChips({ key: '#8', type: 'Task', guide: 'QA', state: 'ready' });
    expect(chips.map((c) => c.text)).toEqual(['#8', 'Task', 'QA', 'ready']);
    expect(chips.map((c) => c.kind)).toEqual(['key', 'type', 'guide', 'state']);
    expect(chips.every((c, i) => i === 0 || c.x > chips[i - 1].x + chips[i - 1].w)).toBe(true);
  });

  it('gives the agent and its step a chip each', () => {
    const chips = layoutChips({ key: '#22', type: 'Execute', state: 'codex-01 · step 3/5' });
    expect(chips.map((c) => c.text)).toEqual(['#22', 'Execute', 'codex-01', 'step 3/5']);
  });

  it('clips the guide and squeezes a crowded row so it never passes the card edge', () => {
    const chips = layoutChips({
      key: '#1',
      type: 'Prototype',
      guide: 'Accessibility',
      state: 'claude-01',
      needsYou: true,
    });
    expect(chips.find((c) => c.kind === 'guide')?.text).toMatch(/^Acc.*…$/);
    expect(right(chips)).toBeLessThanOrEqual(NODE_W - CARD_TEXT_X - 8 + 0.01);
  });

  it('leaves room on the right for a reroute tag', () => {
    const chips = layoutChips({ key: '#13', type: 'Task', guide: 'Security review', reserve: 44 });
    expect(right(chips)).toBeLessThanOrEqual(NODE_W - CARD_TEXT_X - 8 - 44 + 0.01);
  });
});
