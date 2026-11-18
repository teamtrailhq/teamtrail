import { describe, expect, it } from 'vitest';
import { ticketStanding } from '../src/features/inspector/ticketStanding';
import type { StandingInput } from '../src/features/inspector/types';

const NOW = 1_000_000_000;
const base: StandingInput = {
  state: 'frontier',
  now: NOW,
  mine: false,
  hitl: false,
  reviewWaits: false,
  openBlockers: [],
};
const read = (patch: Partial<StandingInput>) => ticketStanding({ ...base, ...patch });

describe('ticketStanding', () => {
  it('puts an open question first, in red, with Answer', () => {
    const s = read({ state: 'claimed', question: { agent: 'claude-01', at: NOW - 35_000 } });
    expect(s).toEqual({
      edge: 'urgent',
      title: "Waiting on you: answer claude-01's question",
      parts: ['35s ago'],
      primary: 'answer',
    });
  });

  it("an fyi question takes the queue's calmer edge", () => {
    const s = read({ question: { agent: 'a', at: NOW }, item: { kind: 'question', edge: 'neutral' } });
    expect(s.edge).toBe('neutral');
  });

  it('says who is working and how recently', () => {
    const lease = { agent: 'claude-01', renewedAt: NOW - 35_000, expiresAt: NOW + 60_000, health: 'live' as const };
    expect(read({ state: 'claimed', lease })).toEqual({
      edge: 'neutral',
      title: 'claude-01 is working on it',
      parts: ['active 35s ago'],
    });
  });

  it('offers Release to queue once the agent went quiet', () => {
    const lease = { agent: 'claude-01', renewedAt: NOW - 600_000, expiresAt: NOW + 60_000, health: 'stalled' as const };
    const s = read({ state: 'claimed', lease });
    expect(s.title).toBe('claude-01 went quiet');
    expect(s.edge).toBe('attention');
    expect(s.primary).toBe('release');
  });

  it('names the failed checks on rework', () => {
    const s = read({ state: 'rework', latest: { result: 'fail', agent: 'a', failed: ['test'] } });
    expect(s.title).toBe('Rework: checks failed (test)');
    expect(s.parts).toEqual(['waits for an agent']);
  });

  it('asks for the approval the queue holds', () => {
    const s = read({
      state: 'verifying',
      item: { kind: 'approval', edge: 'neutral' },
      latest: { result: 'pass', agent: 'a', failed: [] },
    });
    expect(s).toMatchObject({ title: 'Waiting on you: approve it', parts: ['checks passed'], primary: 'approve' });
  });

  it('says done, verified and the open pull request', () => {
    const s = read({ state: 'decided', verified: true, pr: { number: 3, state: 'open' } });
    expect(s).toEqual({ edge: 'done', title: 'Done', parts: ['verified', 'PR #3 open'] });
  });

  it('holds a ticket the brief gates, with Review the brief once it is submitted', () => {
    expect(read({ briefHeld: 'submitted' })).toMatchObject({
      title: 'Held: waits on the brief',
      primary: 'review-brief',
    });
    expect(read({ briefHeld: 'writing' }).primary).toBeUndefined();
  });

  it('holds a ticket changed outside Teamtrail before anything else but a question', () => {
    const s = read({ state: 'claimed', outsideChange: 'state · held until you accept or revert it' });
    expect(s).toMatchObject({ title: 'Held: changed outside Teamtrail', primary: 'review-change' });
  });

  it('turns a calm edge amber when something else puts the ticket at risk', () => {
    expect(read({ state: 'decided', atRisk: true }).edge).toBe('attention');
    expect(read({ question: { agent: 'a', at: NOW }, atRisk: true }).edge).toBe('urgent');
  });

  it('a ticket held by a failing check offers Accept without it; held for anything else, Unblock', () => {
    const latest = { result: 'fail' as const, agent: 'a', failed: ['test'] };
    expect(read({ state: 'held', latest })).toMatchObject({
      title: 'Blocked: checks failed (test)',
      primary: 'waive',
    });
    expect(read({ state: 'held', sentBack: 'the reviewer asked for you' }).primary).toBe('unblock');
  });

  it('a pass the check guard holds says what changed, and offers accepting the pass', () => {
    const latest = { result: 'pass' as const, agent: 'a', failed: [], guarded: 'package.json scripts.test changed' };
    expect(read({ state: 'held', latest })).toMatchObject({
      title: 'Held: the work changed what its checks run',
      parts: ['package.json scripts.test changed', 'waits on you'],
      primary: 'accept',
    });
  });

  it('a ready ticket that needs a person offers Resolve', () => {
    expect(read({ hitl: true })).toMatchObject({ title: 'Ready: needs a person', primary: 'resolve' });
  });

  it('a backlog ticket names what it waits on', () => {
    expect(read({ state: 'blocked', openBlockers: ['#2', '#4'] }).title).toBe('Waits on #2, #4');
  });
});
