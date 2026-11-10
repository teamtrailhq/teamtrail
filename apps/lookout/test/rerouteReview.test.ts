import type { MapSnapshot, RerouteProposal, Ticket } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { changedSinceProposed } from '../src/features/reroute/changedSinceProposed';
import { followProposal } from '../src/features/reroute/followProposal';

const proposal = (id: string, patch: Partial<RerouteProposal> = {}) =>
  ({ id, status: 'pending', at: 100, changes: [], ...patch }) as unknown as RerouteProposal;

describe('the reroute review follows a replaced proposal', () => {
  it('opens the newest one, and says which it replaced', () => {
    const all = [
      proposal('R-1', { status: 'superseded', supersededBy: 'R-2' }),
      proposal('R-2', { status: 'superseded', supersededBy: 'R-3' }),
      proposal('R-3'),
    ];
    expect(followProposal(all, 'R-1')).toEqual({ id: 'R-3', replaced: 'R-1' });
    expect(followProposal(all, 'R-3')).toEqual({ id: 'R-3' });
    expect(followProposal(all, undefined)).toEqual({ id: undefined });
  });
});

describe('what changed on a proposal’s tickets since it was made', () => {
  const t = (id: string, patch: Partial<Ticket>) =>
    ({ id, key: `#${id}`, title: `T${id}`, state: 'open', updatedAt: 50, ...patch }) as unknown as Ticket;
  it('lists tickets it touches that were claimed, closed or edited after it', () => {
    const snap = {
      tickets: [
        t('1', { assignee: 'claude-02', updatedAt: 150 }),
        t('2', { updatedAt: 50 }),
        t('3', { state: 'closed', updatedAt: 120 }),
        t('4', { updatedAt: 200 }),
      ],
    } as unknown as MapSnapshot;
    const p = proposal('R-1', {
      changes: [
        { op: 'cancel_ticket', ticket: '1', reason: 'x' },
        { op: 'edit_ticket', ticket: '2', title: 'y' },
        { op: 'rewire', ticket: '3', addBlockedBy: ['2'] },
        { op: 'add_unspecified', text: 'z' },
      ],
    });
    expect(changedSinceProposed(snap, p)).toEqual([
      { key: '#1', title: 'T1', what: 'claimed by claude-02' },
      { key: '#3', title: 'T3', what: 'closed' },
    ]);
  });
});
