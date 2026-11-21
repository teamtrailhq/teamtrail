import type { AttentionItem } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { bubbleLabel } from '../src/features/bubble/bubbleLabel';
import type { TicketChip } from '../src/features/inspector';

const chips: TicketChip[] = [
  { kind: 'key', text: '#6' },
  { kind: 'type', text: 'Execute' },
  { kind: 'state', text: 'Waits on you', tone: 'urgent' },
  { kind: 'agent', text: 'claude-02', tone: 'agent' },
  { kind: 'model', text: 'Opus', tip: 'claude-opus-5-5' },
  { kind: 'proof', text: 'verified', tone: 'verified' },
];
const text = (parts: ReturnType<typeof bubbleLabel>) => parts.map((p) => (typeof p === 'string' ? p : p.text));

describe('bubbleLabel', () => {
  it('folds the chips into one line in their tones, rose only for what needs you', () => {
    const parts = bubbleLabel({ need: { kind: 'none' }, chips });
    expect(text(parts)).toEqual(['#6', 'Execute', 'Waits on you', 'claude-02', 'Opus', 'verified']);
    expect(parts.map((p) => (typeof p === 'string' ? 'plain' : p.tone))).toEqual([
      'plain',
      'plain',
      'urgent',
      'agent',
      'plain',
      'ok',
    ]);
  });

  it('leads with the need and leaves out a state chip that restates it', () => {
    expect(text(bubbleLabel({ need: { kind: 'question', questionId: 'q' }, chips }))[0]).toBe('Question');
    expect(text(bubbleLabel({ need: { kind: 'question', questionId: 'q' }, chips }))).not.toContain('Waits on you');
    const item = { kind: 'blocked' } as AttentionItem;
    const blocked = bubbleLabel({
      need: { kind: 'item', label: 'Blocked', title: 'x', urgent: false, item },
      chips: [
        { kind: 'key', text: '#3' },
        { kind: 'state', text: 'blocked', tone: 'warn' },
      ],
    });
    expect(text(blocked)).toEqual(['Blocked', '#3']);
    const done = bubbleLabel({
      need: { kind: 'item', label: 'Ready to merge', title: 'x', urgent: false, item },
      chips: [
        { kind: 'key', text: '#3' },
        { kind: 'state', text: 'done' },
      ],
    });
    expect(text(done)).toEqual(['Ready to merge', '#3', 'done']);
  });
});
