import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTENTION_POLICY,
  DEFAULT_MAP_MODE,
  buildAttention,
  parseAttentionPolicy,
  reviewLimitHeld,
  reviewLimitReason,
  reviewLoad,
  type AttentionInput,
  type MapSnapshot,
  type ReviewLoadInput,
  type Ticket,
} from '../src';

const now = Date.UTC(2026, 10, 16, 12);
const min = 60_000;

function ticket(id: string, patch: Partial<Ticket> = {}): Ticket {
  return {
    id,
    key: `#${id}`,
    title: `Ticket ${id}`,
    type: 'execute',
    body: '',
    state: 'open',
    blockedBy: [],
    comments: [],
    createdAt: now - 60 * min,
    updatedAt: now - 60 * min,
    ...patch,
  };
}

function snap(tickets: Ticket[], id = 'm1'): MapSnapshot {
  return {
    map: {
      id,
      key: '#1',
      title: 'Search',
      mode: DEFAULT_MAP_MODE,
      sections: {} as MapSnapshot['map']['sections'],
      createdAt: now,
      updatedAt: now,
    },
    tickets,
  };
}

const approval = (ticketId: string, at: number, kind: 'approve' | 'held' = 'approve') => ({
  kind,
  mapId: 'm1',
  ticketId,
  ticketKey: `#${ticketId}`,
  at,
});

const openPr = (ticketId: string, since: number, mapId = 'm1') => ({
  mapId,
  ticketId,
  ticketKey: `#${ticketId}`,
  flags: [{ kind: 'done-pr-open' as const, severity: 'warn' as const, text: 'PR open', since }],
});

const input = (patch: Partial<ReviewLoadInput> = {}): ReviewLoadInput => ({ approvals: [], syncs: [], ...patch });

describe('reviewLoad', () => {
  it('counts approvals and done tickets with an open PR, oldest first, each ticket once', () => {
    const load = reviewLoad(
      input({
        approvals: [approval('a', now - 5 * min), approval('h', now - 50 * min, 'held')],
        syncs: [openPr('p', now - 30 * min), openPr('a', now - 40 * min)],
        limit: 3,
      }),
    );
    expect(load.waiting.map((w) => [w.ticketKey, w.via])).toEqual([
      ['#p', 'pull-request'],
      ['#a', 'approval'],
    ]);
    expect(load.full).toBe(false);
  });

  it('is full at the limit, and never full while the limit is off', () => {
    const syncs = [openPr('p1', now - 3 * min), openPr('p2', now - 2 * min)];
    expect(reviewLoad(input({ syncs, limit: 2 })).full).toBe(true);
    expect(reviewLoad(input({ syncs, limit: 3 })).full).toBe(false);
    const off = reviewLoad(input({ syncs }));
    expect(off.full).toBe(false);
    expect(off.limit).toBeUndefined();
    expect(reviewLimitReason(off)).toBeUndefined();
  });

  it('ignores PR flags other than a done ticket with its PR still open', () => {
    const syncs = [
      {
        ...openPr('x', now),
        flags: [{ kind: 'pr-merged-not-done' as const, severity: 'alert' as const, text: '', since: now }],
      },
    ];
    expect(reviewLoad(input({ syncs, limit: 1 })).waiting).toEqual([]);
  });
});

describe('reviewLimitHeld', () => {
  const tickets = [
    ticket('e'),
    ticket('t', { type: 'task' }),
    ticket('p', { type: 'prototype' }),
    ticket('r', { type: 'research' }),
    ticket('j', { type: 'junction' }),
    ticket('v', { type: 'review', reviewOf: 'x' }),
    ticket('w', { status: 'rework' }),
    ticket('b', { blockedBy: ['e'] }),
  ];

  it('holds ready implementation work only: rework, research, junction and review tickets go on', () => {
    const held = reviewLimitHeld(snap(tickets), { full: true });
    expect(held.map((t) => t.id).sort()).toEqual(['e', 'p', 't']);
  });

  it('holds nothing while the queue is under the limit', () => {
    expect(reviewLimitHeld(snap(tickets), { full: false })).toEqual([]);
  });
});

describe('reviewLimitReason', () => {
  it('names what waits, the PRs among it, and the limit', () => {
    const syncs = ['1', '2', '3', '4', '5'].map((id, i) => openPr(id, now - (10 - i) * min));
    const reason = reviewLimitReason(reviewLoad(input({ approvals: [approval('9', now)], syncs, limit: 4 })));
    expect(reason).toContain('6 finished tickets wait');
    expect(reason).toContain('#1 (PR), #2 (PR), #3 (PR), #4 (PR), and 2 more');
    expect(reason).toContain("the team's limit is 4");
  });
});

describe('attention.json reviewLimit', () => {
  it('reads a whole number in range, and null as off', () => {
    expect(parseAttentionPolicy({ v: 1, reviewLimit: 5 })).toMatchObject({ value: { reviewLimit: 5 }, errors: [] });
    const off = parseAttentionPolicy({ v: 1, reviewLimit: null });
    expect(off.errors).toEqual([]);
    expect(off.value.reviewLimit).toBeUndefined();
  });

  it('reports a bad value and keeps the limit off', () => {
    for (const bad of [0, 2.5, 51, '5']) {
      const r = parseAttentionPolicy({ v: 1, reviewLimit: bad });
      expect(r.errors).toEqual(['"reviewLimit" must be a whole number from 1 to 50, or null (off)']);
      expect(r.value.reviewLimit).toBeUndefined();
    }
  });
});

describe('review-limit attention item', () => {
  const base = (patch: Partial<AttentionInput>): AttentionInput => ({
    snaps: [snap([ticket('e'), ticket('r', { type: 'research' })])],
    questions: [],
    sessions: [],
    approvals: [],
    syncs: [openPr('p1', now - 90 * min), openPr('p2', now - 20 * min)],
    leases: [],
    knowledge: [],
    briefs: [],
    now,
    ...patch,
  });

  it('asks the human to review, opening the oldest waiting ticket, while the queue is full', () => {
    const q = buildAttention(base({ policy: { ...DEFAULT_ATTENTION_POLICY, reviewLimit: 2 } }));
    const item = q.items.find((i) => i.kind === 'review-limit');
    expect(item).toMatchObject({ ticketId: 'p1', title: 'Review 2 finished tickets: agents wait for you' });
    expect(item?.reasons).toEqual(
      expect.arrayContaining(['1 ready ticket held back', 'start with #p1, waiting longest']),
    );
  });

  it('raises nothing with the limit off or not reached', () => {
    const kinds = (policy = DEFAULT_ATTENTION_POLICY) => buildAttention(base({ policy })).items.map((i) => i.kind);
    expect(kinds()).not.toContain('review-limit');
    expect(kinds({ ...DEFAULT_ATTENTION_POLICY, reviewLimit: 3 })).not.toContain('review-limit');
  });
});
