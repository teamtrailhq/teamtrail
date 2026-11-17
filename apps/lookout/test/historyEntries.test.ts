import type { DecisionRecord } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { historyEntries } from '../src/features/inspector/historyEntries';

const decision = { id: 'D-3', decidedAt: 300, decidedBy: 'claude-01', summary: 'Group by version' } as DecisionRecord;

describe('historyEntries', () => {
  it('lists decisions and comments newest first, a resolution once, as its decision', () => {
    const comments = [
      { id: 'c1', author: 'claude-01', body: 'Looking at the notes', createdAt: 100 },
      { id: 'c2', author: 'claude-01', body: '**Resolution** Group by version', createdAt: 300 },
      { id: 'c3', author: 'operator', body: '**Ruled out of scope** Not needed', createdAt: 200 },
    ];
    const entries = historyEntries({ comments, decisions: [decision] });
    expect(entries.map((e) => [e.id, e.kind, e.text])).toEqual([
      ['D-3', 'decision', 'Group by version'],
      ['c3', 'ruled out of scope', 'Not needed'],
      ['c1', 'comment', 'Looking at the notes'],
    ]);
  });
});
