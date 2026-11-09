import type { MapSnapshot, Ticket } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { criticalEdges } from '../src/features/map/criticalEdges';

const ticket = (id: string, blockedBy: string[] = [], state: 'open' | 'closed' = 'open') =>
  ({ id, blockedBy, state }) as unknown as Ticket;

describe('criticalEdges', () => {
  it('marks the edges along the longest chain of open tickets', () => {
    const tickets = [ticket('a'), ticket('b', ['a']), ticket('c', ['b']), ticket('d', ['a'])];
    const snap = { tickets } as unknown as MapSnapshot;
    expect([...criticalEdges(snap, tickets)]).toEqual(['a>b', 'b>c']);
  });

  it('leaves out walked stretches', () => {
    const tickets = [ticket('a', [], 'closed'), ticket('b', ['a']), ticket('c', ['b'])];
    const snap = { tickets } as unknown as MapSnapshot;
    expect([...criticalEdges(snap, tickets)]).toEqual(['b>c']);
  });
});
