import type { AttentionItem, MapSnapshot, Ticket, TrailBriefing } from '@teamtrail/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { footerText } from '../src/features/hands-off/footerText';
import { needMeta, needsShown, needText, needWhy } from '../src/features/hands-off/needText';
import { progressWords } from '../src/features/hands-off/progressWords';
import { sinceRows } from '../src/features/hands-off/sinceRows';
import type { PrSyncSnapshot } from '../src/lib';

// the feature's barrels read the page's address when they load
vi.hoisted(() =>
  Object.assign(globalThis, { location: { search: '', href: 'http://127.0.0.1/', origin: 'http://127.0.0.1' } }),
);

const now = new Date('2026-11-18T15:00:00').getTime();
const item = (over: Partial<AttentionItem> = {}): AttentionItem => ({
  id: 'question::q1',
  kind: 'question',
  mapId: 'm1',
  title: 'What storage budget per device?',
  since: now - 22 * 60_000,
  urgency: 'soon',
  score: 50,
  reasons: [],
  batchKey: 'k',
  ref: 'q1',
  agent: 'claude-03',
  ...over,
});
const ticket = (id: string, over: Partial<Ticket> = {}) =>
  ({ id, key: `#${id}`, title: `Ticket ${id}`, state: 'open', blockedBy: [], createdAt: 0, ...over }) as Ticket;
const snap = (tickets: Ticket[]) =>
  ({ map: { id: 'm1', key: '#1', title: 'Offline sync', createdAt: 0 }, tickets }) as unknown as MapSnapshot;

describe('Needs you rows', () => {
  test('a question says Answer; one asked high risk says so on its chip', () => {
    expect(needText(item())).toEqual({ chip: 'Question', title: 'What storage budget per device?', quick: 'Answer' });
    const q = { id: 'q1', text: 'Merge shared edits silently?', lookoutOnly: true } as never;
    expect(needText(item(), q).chip).toBe('High risk');
    expect(needText(item({ kind: 'stalled', title: 'claude-03 went quiet' })).quick).toBe('Release');
    expect(needText(item({ kind: 'guide', title: 'New guide' })).quick).toBe('Review');
  });

  test("a ticket's criteria are confirmed with the plan on a trail whose brief waits; elsewhere on their own", () => {
    const criteria = (mapId: string) => item({ id: `criteria:${mapId}`, kind: 'criteria', mapId, title: 'Confirm' });
    const items = [item({ id: 'brief:m1', kind: 'brief', title: 'Brief' }), criteria('m1'), criteria('m2')];
    expect(needsShown(items).map((i) => i.id)).toEqual(['brief:m1', 'criteria:m2']);
    expect(needText(criteria('m2')).quick).toBe('Confirm criteria');
  });

  test('the dim context: another trail by name, the ticket unless the title names it, who asks and the wait', () => {
    const s = snap([ticket('10')]);
    expect(needMeta({ item: item({ ticketId: '10' }), snap: s, current: 'm1', now })).toEqual([
      { text: '#10', code: true },
      'claude-03',
      '22m',
    ]);
    expect(needMeta({ item: item({ ticketId: '10' }), snap: s, current: 'm2', now })[0]).toBe('Offline sync');
    const named = item({ kind: 'approval', ticketId: '10', title: '#10 ready', agent: undefined });
    expect(needMeta({ item: named, snap: s, current: 'm1', now })).toEqual(['22m']);
  });

  test('an open row says why once: the ticket only when the title does not name it, then the reasons', () => {
    const t = ticket('9', { title: 'Add Bye component with looping fade in/out' });
    const reasons = ['Sign off AC-2, AC-3', 'The text fades in, holds, fades out and repeats forever'];
    const named = item({ kind: 'approval', ticketId: '9', title: 'Approve #9 Add Bye component', reasons });
    expect(needWhy(named, t)).toEqual(reasons);
    const unnamed = item({ kind: 'blocked', ticketId: '9', title: 'Blocked on a decision', reasons: ['Waits on #3'] });
    expect(needWhy(unnamed, t)).toEqual(['#9 Add Bye component with looping fade in/out', 'Waits on #3']);
  });
});

describe('Progress in one line', () => {
  const counts = { done: 9, total: 15, working: 2, needs: 1, waiting: 0, notStarted: 3 };
  const segs = Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, key: `#${i}`, title: '', tone: 'done' as const }));
  const text = (parts: ReturnType<typeof progressWords>) =>
    parts.filter(Boolean).map((p) => (typeof p === 'string' ? p : p.text));

  test('all verified when every done ticket with a proof is', () => {
    const proofs = Object.fromEntries(segs.map((s) => [s.id, 'verified' as const]));
    expect(text(progressWords(counts, segs, proofs))).toEqual([
      '9 of 15 done',
      'all verified',
      '2 at work',
      '1 needs you',
      '3 not started',
    ]);
  });

  test('how many when some are not; nothing about proofs when no done ticket has one', () => {
    expect(text(progressWords(counts, segs, { t0: 'verified', t1: 'not-verified' }))[1]).toBe('1 verified');
    expect(text(progressWords(counts, segs, {}))[1]).toBe('2 at work');
    expect(text(progressWords({ ...counts, needs: 2 }, segs))).toContain('2 need you');
  });
});

describe('Since you were away', () => {
  const brief = (over: Partial<TrailBriefing>) =>
    ({ mapId: 'm1', since: 100, done: [], ruledOut: [], opened: [], agentDecisions: [], ...over }) as TrailBriefing;

  test("agents' decisions first, then plan changes, then finished work newest first", () => {
    const d = { id: 'D-1' } as never;
    const rows = sinceRows(
      brief({
        agentDecisions: [d],
        ruledOut: [ticket('14')],
        opened: [ticket('30')],
        done: [ticket('4'), ticket('21')],
      }),
      50,
    );
    expect(rows.map((r) => r.kind)).toEqual(['decision', 'ruled-out', 'added', 'done', 'done']);
    expect(rows.at(-1)).toMatchObject({ ticket: { id: '4' } });
  });

  test('a first visit counts nothing as added: the whole plan is new', () => {
    expect(sinceRows(brief({ since: 0, opened: [ticket('30')] }), 0)).toEqual([]);
  });
});

describe('the footer', () => {
  const prs = { reached: true, live: true, tickets: {} } as PrSyncSnapshot;
  const done = (id: string, at = now - 3_600_000) =>
    ticket(id, { state: 'closed', closeReason: 'completed', closedAt: at });

  test('locally: what was verified and merged today', () => {
    const s = snap([done('4'), done('21'), done('9', now - 3 * 86_400_000)]);
    const merged = { ...prs, tickets: { 'm1/4': { pr: { state: 'merged' } } } } as unknown as PrSyncSnapshot;
    const text = footerText({ snap: s, proofs: { '4': 'verified', '21': 'verified' }, prs: merged, now });
    expect(text).toBe('Today: 2 verified, 1 merged.');
    expect(footerText({ snap: snap([]), prs, now })).toBe('Nothing finished today yet.');
  });

  test('behind a server that merges verified work itself: its count', () => {
    expect(footerText({ snap: snap([]), prs, now, autoMerged: 4 })).toBe(
      '4 verified PRs merged automatically today. Unverified work waits for you.',
    );
    expect(footerText({ snap: snap([]), prs, now, autoMerged: 1 })).toMatch(/^1 verified PR merged/);
  });
});

describe('the mode is per person', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const origin = 'https://cloud.example.test';
  function page(store: Record<string, string> = {}) {
    vi.stubGlobal('location', { href: `${origin}/`, origin, search: '' });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
    });
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    return { store, fetch };
  }

  test('Hands-off until this browser has shown another; storage that throws is the default', async () => {
    page();
    const { cachedMode } = await import('../src/lib/lookoutMode');
    expect(cachedMode()).toBe('hands-off');
    page({ 'teamtrail.lookout-mode': 'hands-on' });
    expect(cachedMode()).toBe('hands-on');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(cachedMode()).toBe('hands-off');
  });

  test("saved in the person's prefs on the Lookout's machine, or where the server saves it", async () => {
    const { fetch } = page();
    const { saveMode } = await import('../src/lib/lookoutMode');
    const { learnManagedSignIn, managedSignIn } = await import('../src/lib/managedSignIn');
    expect(await saveMode('hands-on')).toBeUndefined();
    expect(fetch.mock.calls[0][0]).toMatch(/\/attention\/mode$/);
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], mode: 'hands-on', modeSave: '/_cloud/mode' } });
    expect(managedSignIn()?.mode).toBe('hands-on');
    await saveMode('hands-off');
    expect(fetch.mock.calls[1][0]).toBe('/_cloud/mode');
    expect(
      JSON.parse(String((fetch.mock.calls[1] as unknown[])[1] && (fetch.mock.calls[1][1] as RequestInit).body)),
    ).toEqual({
      mode: 'hands-off',
    });
    expect(managedSignIn()?.mode).toBe('hands-off');
  });

  test('a mode or a place to save it the server gives is kept only when well formed', async () => {
    page();
    const { learnManagedSignIn, managedSignIn } = await import('../src/lib/managedSignIn');
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], mode: 'hands-free', modeSave: 'https://evil.test/x' } });
    expect(managedSignIn()?.mode).toBeUndefined();
    expect(managedSignIn()?.modeSave).toBeUndefined();
  });

  test("the server's auto-merge count, with its setting on this origin only", async () => {
    const { fetch } = page();
    const { learnManagedSignIn } = await import('../src/lib/managedSignIn');
    const { loadAutoMerge } = await import('../src/lib/autoMerge');
    expect(await loadAutoMerge('m1', 0)).toBeUndefined();
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], autoMerge: '/_cloud/auto-merge' } });
    const body = { on: true, merged: 4, settings: '/_cloud/repos#auto-merge', merges: [], waiting: [] };
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body)));
    expect(await loadAutoMerge('m1', 123)).toEqual({ on: true, merged: 4, settings: '/_cloud/repos#auto-merge' });
    expect(fetch.mock.calls.at(-1)?.[0]).toBe('/_cloud/auto-merge?since=123&trail=m1');
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...body, settings: '//evil.test/x' })));
    expect((await loadAutoMerge('m1', 0))?.settings).toBeUndefined();
  });
});
