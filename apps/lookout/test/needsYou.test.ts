import type { AttentionItem, AttentionKind } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { chipsOfTicket } from '../src/features/inspector/chipsOfTicket';
import { needPrimary } from '../src/features/inspector/needPrimary';
import { ticketStanding } from '../src/features/inspector/ticketStanding';
import type { StandingInput } from '../src/features/inspector/types';

vi.hoisted(() => vi.stubGlobal('location', { search: '' }));

const base: StandingInput = {
  state: 'frontier',
  now: 0,
  mine: false,
  hitl: false,
  reviewWaits: false,
  openBlockers: [],
};
const item = (kind: AttentionKind, title = '#20: Review the discovery brief for Team workspaces') =>
  ({ id: `${kind}-1`, kind, title, mapId: 'm', ticketId: '20', ref: 'x' }) as AttentionItem;

describe('a ticket that needs you', () => {
  it('says so on its state chip, in red, in the map card’s words', () => {
    const chips = chipsOfTicket({ key: '#20', type: 'research', state: 'frontier', need: 'needs you' });
    expect(chips[2]).toEqual({ kind: 'state', text: 'needs you', tone: 'urgent' });
  });

  it('asks it on the state line, with the action that does it as the primary', () => {
    const s = ticketStanding({
      ...base,
      item: { kind: 'brief', edge: 'neutral', title: 'Review the discovery brief for Team workspaces' },
    });
    expect(s).toEqual({
      edge: 'attention',
      title: 'Waiting on you: review the discovery brief',
      parts: ['Review the discovery brief for Team workspaces'],
      primary: 'need',
    });
  });

  it('keeps the words the state line has for its own kinds: an approval, a decision that is yours', () => {
    expect(ticketStanding({ ...base, state: 'verifying', item: { kind: 'approval', edge: 'urgent' } }).primary).toBe(
      'approve',
    );
    expect(ticketStanding({ ...base, hitl: true, item: { kind: 'hitl-ready', edge: 'urgent' } }).primary).toBe(
      'resolve',
    );
  });

  it('maps each kind to its action: the place it is handled, the PR, setting it aside, a ticket action', () => {
    const onItem = vi.fn();
    const onDismiss = vi.fn();
    const release = { id: 'release-lease', label: 'Release to queue', onSelect: () => {} };
    const pr = { pr: { url: 'https://github.com/o/r/pull/3' } } as never;
    const primary = (kind: AttentionKind, v = {}) =>
      needPrimary({ v: { items: [item(kind)], ...v }, all: [release], onItem, onDismiss });
    expect(primary('brief')?.label).toBe('Review the brief');
    primary('brief')?.onSelect();
    expect(onItem).toHaveBeenCalledWith(expect.objectContaining({ kind: 'brief' }));
    expect(primary('reroute')?.label).toBe('Review the reroute');
    expect(primary('trust')?.label).toBe('Open Approvals');
    expect(primary('merge', { pr })?.label).toBe('Open the PR');
    expect(primary('merge')).toBeUndefined();
    expect(primary('overlap')).toBe(release);
    primary('policy')?.onSelect();
    expect(onDismiss).toHaveBeenCalledWith('policy-1');
    expect(primary('integration')).toBeUndefined();
    expect(primary('approval')).toBeUndefined();
  });
});
