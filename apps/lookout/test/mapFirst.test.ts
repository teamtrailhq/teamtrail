import type { AttentionItem, LaidOutNode, MapSnapshot, SessionInfo, Ticket } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { cardNeedText, needLabel } from '../src/features/attention/needLabel';
import { bubblePlace } from '../src/features/bubble/bubblePlace';
import { needOf } from '../src/features/bubble/needOf';
import { mainTone } from '../src/features/main-checks/mainTone';
import { statePart } from '../src/features/map/statePart';
import { countWords, trailCounts, trailSegments } from '../src/features/trail-bar/trailBarModel';
import { upNextRows } from '../src/features/trail-bar/upNextRows';
import { liveTickets } from '../src/lib/liveTickets';
import { shortModel } from '../src/lib/shortModel';
import { waitsOnText } from '../src/lib/waitsOnText';

vi.hoisted(() => vi.stubGlobal('location', { search: '' }));

const NOW = 1_800_000_000_000;
const ticket = (id: string, patch: Partial<Ticket> = {}) =>
  ({
    id,
    key: `#${id}`,
    title: `T${id}`,
    type: 'execute',
    state: 'open',
    blockedBy: [],
    comments: [],
    createdAt: NOW - 60 * 60_000,
    updatedAt: NOW,
    ...patch,
  }) as unknown as Ticket;
const done = { state: 'closed', closeReason: 'completed', closedAt: NOW - 2 * 60_000 } as const;
const snapOf = (tickets: Ticket[]) => ({ map: { id: 'm', mode: 'plan+execute' }, tickets }) as unknown as MapSnapshot;
const session = (ticketId: string, patch: Partial<SessionInfo> = {}) =>
  ({
    id: `s-${ticketId}`,
    agent: 'codex-01',
    mode: 'work',
    mapId: 'm',
    ticketId,
    step: 3,
    total: 5,
    stepLabel: 'Resolve',
    status: 'running',
    startedAt: NOW - 12 * 60_000,
    model: 'claude-sonnet-4-5-20250929',
    ...patch,
  }) as SessionInfo;
const item = (kind: AttentionItem['kind'], patch: Partial<AttentionItem> = {}) =>
  ({
    id: `${kind}:m:${patch.ticketId ?? ''}`,
    kind,
    mapId: 'm',
    title: 'Something',
    since: NOW - 3 * 60_000,
    urgency: 'soon',
    score: 1,
    reasons: [],
    batchKey: kind,
    ref: patch.ticketId ?? kind,
    ...patch,
  }) as AttentionItem;

/** A small trail: two done, one with an agent, one that asks you, one waiting for an agent, two that wait. */
function trail() {
  const tickets = [
    ticket('2', done),
    ticket('3', { ...done, type: 'junction' }),
    ticket('22', { blockedBy: ['2'], assignee: 'codex-01' }),
    ticket('6', { blockedBy: ['3'], type: 'junction', hitl: 'hitl' } as Partial<Ticket>),
    ticket('10', { blockedBy: ['2'] }),
    ticket('13', { blockedBy: ['22', '10'] }),
    ticket('9', { blockedBy: ['6'] }),
  ];
  const items = [
    item('question', { ticketId: '6', agent: 'claude-05' }),
    item('main-checks', { title: 'test already fails on main: choose how this trail goes on' }),
  ];
  const live = liveTickets({ snap: snapOf(tickets), sessions: [session('22')], items });
  return { live, items };
}

describe('live tickets: one tone each, the same on the map, the trail bar and the bubble', () => {
  it('reads done, working, needs you, waiting for an agent and not started', () => {
    const { live } = trail();
    const tone = (id: string) => live.get(id)?.tone;
    expect([tone('2'), tone('22'), tone('6'), tone('10'), tone('13'), tone('9')]).toEqual([
      'done',
      'working',
      'needs',
      'waiting-agent',
      'not-started',
      'not-started',
    ]);
  });

  it('says since when a ticket could be picked up, and what one that waits waits on', () => {
    const { live } = trail();
    expect(live.get('10')?.readySince).toBe(NOW - 2 * 60_000);
    expect(waitsOnText(live.get('13')!.waitsOn, live.get('13')!.waitsOnYours)).toBe('waits on #22, #10');
    expect(waitsOnText(live.get('9')!.waitsOn, live.get('9')!.waitsOnYours)).toBe('waits on your #6');
    expect(waitsOnText(['#1', '#2', '#3'], [])).toBe('waits on 3 tickets');
  });

  it('keeps a ready ticket held for the brief or a model out of "waiting for an agent"', () => {
    const tickets = [ticket('1')];
    const live = liveTickets({ snap: snapOf(tickets), sessions: [], items: [], heldBack: () => true });
    expect(live.get('1')?.tone).toBe('not-started');
  });
});

describe('the trail bar', () => {
  it('has one segment per ticket in trail order, and counts in words', () => {
    const { live, items } = trail();
    const segments = trailSegments(live);
    expect(segments.map((s) => s.key)).toEqual(['#2', '#3', '#22', '#6', '#10', '#13', '#9']);
    const counts = trailCounts(segments, items);
    expect(counts).toEqual({ done: 2, total: 7, working: 1, needs: 2, waiting: 1, notStarted: 2 });
    expect(countWords(counts).map((p) => p.text)).toEqual([
      '2 of 7 done',
      '1 at work',
      '2 need you',
      '1 waiting for an agent',
      '2 not started',
    ]);
    expect(countWords(counts).find((p) => p.urgent)?.text).toBe('2 need you');
  });

  it('leaves ruled-out tickets and empty counts out', () => {
    const live = liveTickets({
      snap: snapOf([ticket('1', done), ticket('2', { state: 'closed', closeReason: 'not_planned' })]),
      sessions: [],
      items: [],
    });
    const segments = trailSegments(live);
    expect(segments).toHaveLength(1);
    expect(countWords(trailCounts(segments, [])).map((p) => p.text)).toEqual(['1 of 1 done']);
  });

  it('chips what needs you as the key and what to do', () => {
    const keyOf = (id: string) => `#${id}`;
    expect(needLabel(item('question', { ticketId: '6', agent: 'claude-05' }), keyOf)).toBe('#6 Answer claude-05');
    expect(needLabel(item('merge', { ticketId: '12', title: '#12: PR #14 ready to merge' }), keyOf)).toBe(
      '#12 Merge PR #14',
    );
    expect(needLabel(trail().items[1], keyOf)).toBe('main: test fails');
    expect(needLabel(item('brief'), keyOf)).toBe('Brief');
    expect(needLabel(item('approval', { ticketId: '4' }), keyOf)).toBe('#4 Approve');
  });

  it('lists up next: waiting for an agent first, then what waits on you', () => {
    const rows = upNextRows([...trail().live.values()], NOW);
    expect(rows.map((r) => [r.ticket.key, r.context])).toEqual([
      ['#10', 'Waiting for an agent to pick it up · 2m'],
      ['#9', 'Waits on your #6'],
    ]);
  });
});

describe('cards', () => {
  const node = (t: Ticket, state: LaidOutNode['state']) => ({ ticket: t, state }) as unknown as LaidOutNode;

  it("name the agent's model, else the agent", () => {
    const part = statePart({
      n: node(ticket('22'), 'claimed'),
      session: session('22'),
      waiting: false,
      model: 'Sonnet 4.5',
    });
    expect(part).toEqual({ text: 'Sonnet 4.5', tone: 'agent' });
    const unknown = statePart({ n: node(ticket('22'), 'claimed'), session: session('22'), waiting: false });
    expect(unknown.text).toBe('codex-01');
  });

  it('say ready for an agent and for how long, what they wait on, and what needs you', () => {
    const n = node(ticket('10'), 'frontier');
    expect(statePart({ n, waiting: false, readyFor: '2m' })).toEqual({
      text: 'ready 2m',
      tone: 'wait',
    });
    expect(statePart({ n: node(ticket('13'), 'blocked'), waiting: false, waitsOn: 'waits on #22' }).tone).toBe('waits');
    expect(statePart({ n, waiting: false, need: cardNeedText(item('merge')) })).toEqual({
      text: 'ready to merge',
      tone: 'urgent',
    });
  });

  it('shorten model ids as people say them', () => {
    expect(shortModel('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
    expect(shortModel('claude-opus-4-1')).toBe('Opus 4.1');
    expect(shortModel('claude-3-5-haiku-latest')).toBe('Haiku 3.5');
    expect(shortModel('gpt-5-codex')).toBe('GPT-5 Codex');
    expect(shortModel('gpt-4.1-mini')).toBe('GPT-4.1 mini');
    expect(shortModel('o3')).toBe('o3');
    expect(shortModel(undefined)).toBeUndefined();
  });
});

describe('the bubble', () => {
  const urgentOf = (i: AttentionItem) => i.urgency === 'blocking';

  it('leads with the agent question, else the most urgent item, else the ticket alone', () => {
    expect(needOf({ questionId: 'q1', items: [item('question')], urgentOf })).toEqual({
      kind: 'question',
      questionId: 'q1',
    });
    const merge = needOf({ items: [item('merge', { title: '#12: PR #14 ready to merge' })], urgentOf });
    expect(merge).toMatchObject({
      kind: 'item',
      label: 'Ready to merge',
      title: 'PR #14 ready to merge',
      urgent: false,
    });
    const blocked = needOf({ items: [item('blocked', { urgency: 'blocking' })], urgentOf });
    expect(blocked).toMatchObject({ kind: 'item', label: 'Blocked', urgent: true });
    expect(needOf({ items: [item('approval')], urgentOf })).toMatchObject({ label: 'Approve it' });
    expect(needOf({ items: [item('hitl-ready')], urgentOf })).toMatchObject({ label: 'Yours to decide' });
    expect(needOf({ items: [item('stalled')], urgentOf })).toMatchObject({ label: 'Went quiet' });
    expect(needOf({ items: [item('overlap')], urgentOf })).toMatchObject({ label: 'Two agents, same files' });
    expect(needOf({ items: [], urgentOf })).toEqual({ kind: 'none' });
  });

  it('sits beside its ticket on the side with room, inside the map', () => {
    const box = { w: 1200, h: 600 };
    const bubble = { w: 360, h: 300 };
    const left = bubblePlace({ anchor: { left: 100, top: 200, right: 300, bottom: 256 }, box, bubble });
    expect(left).toEqual({ left: 314, top: 78, side: 'right' });
    const right = bubblePlace({ anchor: { left: 900, top: 20, right: 1100, bottom: 76 }, box, bubble });
    expect(right).toMatchObject({ left: 526, top: 8, side: 'left' });
    expect(bubblePlace({ box, bubble })).toEqual({ left: 832, top: 8, side: 'corner' });
  });
});

describe('checks on main at the start of the trail', () => {
  const view = (state: Record<string, unknown>) => ({ mapId: 'm', state, choices: {}, holds: false }) as never;
  it('is red while you have to choose, a check when they pass, gone while off', () => {
    expect(mainTone(view({ kind: 'off', reason: '' }), false)).toBeUndefined();
    expect(mainTone(view({ kind: 'failed', failing: ['test'], fixing: false }), false)).toBe('needs');
    expect(mainTone(view({ kind: 'failed', failing: ['test'], fixing: true }), false)).toBe('attention');
    expect(mainTone(view({ kind: 'passed' }), false)).toBe('passed');
    expect(mainTone(view({ kind: 'accepted', known: [], dropped: [] }), true)).toBe('needs');
  });
});
