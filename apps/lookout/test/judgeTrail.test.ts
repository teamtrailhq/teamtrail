import type { MapSnapshot, Ticket, TrailTogether } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { judgeTrail } from '../src/features/trail-done/judgeTrail';

// Some modules these pull in read the page's address when they load (vitest hoists this above the imports).
vi.hoisted(() => vi.stubGlobal('location', { search: '' }));

const ticket = (id: string, type: string, patch: Partial<Ticket> = {}) =>
  ({ id, key: `#${id}`, title: `T${id}`, type, state: 'open', blockedBy: [], ...patch }) as unknown as Ticket;
const completed = { state: 'closed', closeReason: 'completed' } as const;
const passed: TrailTogether = { kind: 'passed', commit: 'abc1234def', branch: 'main', runId: 'T-1' };
const snapOf = (tickets: Ticket[]) => ({ map: { id: 'm' }, tickets }) as unknown as MapSnapshot;

const judge = (tickets: Ticket[], skipped: boolean | undefined) =>
  judgeTrail({
    snap: snapOf(tickets),
    proofs: Object.fromEntries(tickets.map((t) => [t.id, 'verified' as const])),
    together: passed,
    skipped,
    pendingReroutes: 0,
  });

describe('whether the trail on the page reached its destination', () => {
  it('a trail whose only ticket, its discovery research, is done has not: its plan is not charted yet', () => {
    const done = judge([ticket('1', 'research', completed)], false);
    expect(done).toEqual({ kind: 'not-done', reason: "The plan isn't charted yet" });
  });

  it('waits for the discovery stage before judging, so the flag never shows for a moment', () => {
    expect(judge([ticket('1', 'research', completed)], undefined)).toBeUndefined();
    expect(judge([ticket('1', 'research', completed), ticket('2', 'task', completed)], undefined)).toBeUndefined();
  });

  it('is reached once the charted work is done too', () => {
    const done = judge([ticket('1', 'research', completed), ticket('2', 'task', completed)], false);
    expect(done?.kind).toBe('verified');
  });

  it('a trail that skipped discovery is reached with its research alone', () => {
    expect(judge([ticket('1', 'research', completed)], true)?.kind).toBe('verified');
  });
});
