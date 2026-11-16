import { describe, expect, it } from 'vitest';
import { trailDone } from '../src';

type T = { id: string; state: 'open' | 'closed'; closeReason?: 'completed' | 'not_planned' };
const done = (id: string): T => ({ id, state: 'closed', closeReason: 'completed' });
const open = (id: string): T => ({ id, state: 'open' });
const ruledOut = (id: string): T => ({ id, state: 'closed', closeReason: 'not_planned' });

describe('trailDone', () => {
  it('is verified when every ticket in scope is done with a verified proof', () => {
    const r = trailDone({
      tickets: [done('1'), done('2'), ruledOut('3')],
      proofs: { '1': 'verified', '2': 'verified' },
      pendingReroutes: 0,
    });
    expect(r).toEqual({ kind: 'verified', done: 2, reason: 'All 2 tickets done and verified' });
  });

  it('is done but unverified when a done ticket has no verified proof, and says how many', () => {
    const r = trailDone({
      tickets: [done('1'), done('2'), done('3')],
      proofs: { '1': 'verified', '2': 'not-verified' },
      pendingReroutes: 0,
    });
    expect(r).toEqual({
      kind: 'unverified',
      done: 3,
      unverified: ['2', '3'],
      reason: '3 tickets done · 2 not verified',
    });
  });

  it('says none verified when no done ticket is', () => {
    const r = trailDone({ tickets: [done('1')], proofs: { '1': 'not-verified' }, pendingReroutes: 0 });
    expect(r.reason).toBe('1 ticket done · none verified');
  });

  it('is not done while a ticket is open, waiting for review included', () => {
    const r = trailDone({ tickets: [done('1'), open('2')], proofs: { '1': 'verified' }, pendingReroutes: 0 });
    expect(r).toEqual({ kind: 'not-done', reason: '1 ticket still open' });
  });

  it('is not done while a reroute is pending', () => {
    const r = trailDone({ tickets: [done('1')], proofs: { '1': 'verified' }, pendingReroutes: 1 });
    expect(r).toEqual({ kind: 'not-done', reason: 'A reroute waits for your review' });
  });

  it('is not done with nothing in scope', () => {
    expect(trailDone({ tickets: [], proofs: {}, pendingReroutes: 0 }).kind).toBe('not-done');
    expect(trailDone({ tickets: [ruledOut('1')], proofs: {}, pendingReroutes: 0 }).kind).toBe('not-done');
  });

  it('gives the same answer for the same input', () => {
    const input = { tickets: [done('1'), done('2')], proofs: { '2': 'verified' as const }, pendingReroutes: 0 };
    expect(trailDone(input)).toEqual(trailDone(input));
  });
});
