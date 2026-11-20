import type { AttentionItem } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { glanceWaitParts } from '../src/features/inspector/glanceWaitParts';

const NOW = 1_000_000_000;
const keys: Record<string, string> = { t6: '#6', t23: '#23' };
const keyOf = (id: string) => keys[id];

function item(over: Partial<AttentionItem>): AttentionItem {
  return {
    id: 'a',
    kind: 'question',
    mapId: 'm',
    title: 'Merge shared edits silently, or ask the owner first?',
    since: NOW - 14 * 60_000,
    urgency: 'soon',
    ...over,
  } as AttentionItem;
}

describe('glanceWaitParts', () => {
  it('reads kind, key, agent and how long it has waited', () => {
    expect(glanceWaitParts({ item: item({ ticketId: 't6', agent: 'claude-02' }), keyOf, now: NOW })).toEqual([
      'Question',
      '#6',
      'claude-02',
      '14m',
    ]);
  });

  it('leaves the key out when the title already names it', () => {
    const parts = glanceWaitParts({
      item: item({ kind: 'model', ticketId: 't6', title: '#6 needs a strongest model' }),
      keyOf,
      now: NOW,
    });
    expect(parts).not.toContain('#6');
  });

  it('leads with a rose Blocking when the item holds work up', () => {
    const [first] = glanceWaitParts({ item: item({ urgency: 'blocking' }), keyOf, now: NOW });
    expect(first).toEqual({ text: 'Blocking', tone: 'urgent' });
  });
});
