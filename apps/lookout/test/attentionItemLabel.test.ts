import type { AttentionItem, MapSnapshot } from '@teamtrail/core';
import { describe, expect, test } from 'vitest';
import { itemLabel } from '../src/features/attention/rowText';

const now = 1_000_000_000;
const item = (over: Partial<AttentionItem> = {}): AttentionItem =>
  ({
    id: 'question::q1',
    kind: 'question',
    mapId: 'm1',
    title: 'What storage budget per device?',
    since: now - 22 * 60_000,
    urgency: 'soon',
    reasons: [],
    agent: 'claude-03',
    ticketId: '10',
    ...over,
  }) as AttentionItem;
const snap = {
  map: { id: 'm1', title: 'Offline sync' },
  tickets: [{ id: '10', key: '#10', title: 'Budget' }],
} as never as MapSnapshot;

describe("a queue row's label line", () => {
  test('who asks, the ticket, and the wait; the trail only when it is another', () => {
    expect(itemLabel({ item: item(), snap, otherTrail: false, now })).toEqual(['claude-03 asks', '#10', '22m']);
    expect(itemLabel({ item: item(), snap, otherTrail: true, now })).toContain('Offline sync');
  });

  test('Blocking first, in rose; the ticket left out when the title names it', () => {
    const parts = itemLabel({
      item: item({ urgency: 'blocking', kind: 'approval', title: 'Approve #10', agent: undefined }),
      snap,
      otherTrail: false,
      now,
    });
    expect(parts[0]).toEqual({ text: 'Blocking', tone: 'urgent', className: 'urgency-tag' });
    expect(parts).not.toContain('#10');
  });
});
