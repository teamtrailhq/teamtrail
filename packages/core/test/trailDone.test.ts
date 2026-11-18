import { describe, expect, it } from 'vitest';
import { trailDone, type TrailTogether } from '../src';

type T = { id: string; state: 'open' | 'closed'; closeReason?: 'completed' | 'not_planned' };
const done = (id: string): T => ({ id, state: 'closed', closeReason: 'completed' });
const open = (id: string): T => ({ id, state: 'open' });
const ruledOut = (id: string): T => ({ id, state: 'closed', closeReason: 'not_planned' });
const passed: TrailTogether = { kind: 'passed', commit: 'abc1234def', branch: 'main', runId: 'T-1' };
const pending: TrailTogether = { kind: 'pending', reason: 'Waiting for PR #5 to merge' };
const failed: TrailTogether = { kind: 'failed', reason: 'test fails on main at abc1234 after merging', runId: 'T-2' };

describe('trailDone', () => {
  it('is verified when every ticket is verified and the checks passed together on main', () => {
    const r = trailDone({
      tickets: [done('1'), done('2'), ruledOut('3')],
      proofs: { '1': 'verified', '2': 'verified' },
      pendingReroutes: 0,
      together: passed,
    });
    expect(r).toEqual({
      kind: 'verified',
      done: 2,
      together: passed,
      reason: 'All 2 tickets verified · verified together on main at abc1234',
    });
  });

  it('is not verified while the combined run is pending, even with every proof verified', () => {
    const r = trailDone({
      tickets: [done('1'), done('2')],
      proofs: { '1': 'verified', '2': 'verified' },
      pendingReroutes: 0,
      together: pending,
    });
    expect(r).toEqual({
      kind: 'unverified',
      done: 2,
      unverified: [],
      together: pending,
      reason: '2 tickets done · waiting for PR #5 to merge',
    });
  });

  it('is not verified when the combined run failed, and says so', () => {
    const r = trailDone({ tickets: [done('1')], proofs: { '1': 'verified' }, pendingReroutes: 0, together: failed });
    expect(r.kind).toBe('unverified');
    expect(r.reason).toBe('1 ticket done · test fails on main at abc1234 after merging');
  });

  it('is done but unverified when a done ticket has no verified proof, and says how many', () => {
    const r = trailDone({
      tickets: [done('1'), done('2'), done('3')],
      proofs: { '1': 'verified', '2': 'not-verified' },
      pendingReroutes: 0,
      together: passed,
    });
    expect(r).toEqual({
      kind: 'unverified',
      done: 3,
      unverified: ['2', '3'],
      together: passed,
      reason: '3 tickets done · 2 not verified · verified together on main at abc1234',
    });
  });

  it('says none verified when no done ticket is', () => {
    const r = trailDone({
      tickets: [done('1')],
      proofs: { '1': 'not-verified' },
      pendingReroutes: 0,
      together: pending,
    });
    expect(r.reason).toBe('1 ticket done · none verified · waiting for PR #5 to merge');
  });

  it('is not done while a ticket is open, waiting for review included', () => {
    const r = trailDone({
      tickets: [done('1'), open('2')],
      proofs: { '1': 'verified' },
      pendingReroutes: 0,
      together: passed,
    });
    expect(r).toEqual({ kind: 'not-done', reason: '1 ticket still open' });
  });

  it('is not done while a reroute is pending', () => {
    const r = trailDone({ tickets: [done('1')], proofs: { '1': 'verified' }, pendingReroutes: 1, together: passed });
    expect(r).toEqual({ kind: 'not-done', reason: 'A reroute waits for your review' });
  });

  it('is not done with nothing in scope', () => {
    expect(trailDone({ tickets: [], proofs: {}, pendingReroutes: 0, together: passed }).kind).toBe('not-done');
    expect(trailDone({ tickets: [ruledOut('1')], proofs: {}, pendingReroutes: 0, together: passed }).kind).toBe(
      'not-done',
    );
  });

  it('gives the same answer for the same input', () => {
    const input = {
      tickets: [done('1'), done('2')],
      proofs: { '2': 'verified' as const },
      pendingReroutes: 0,
      together: pending,
    };
    expect(trailDone(input)).toEqual(trailDone(input));
  });

  it("is not done while a done ticket's work hasn't landed: no flag, no Destination reached", () => {
    const r = trailDone({
      tickets: [done('1')],
      proofs: { '1': 'verified' },
      pendingReroutes: 0,
      together: { kind: 'not-landed', reason: 'PR #4 closed without merging' },
    });
    expect(r).toEqual({ kind: 'not-done', reason: "The work hasn't landed: PR #4 closed without merging" });
  });
});
