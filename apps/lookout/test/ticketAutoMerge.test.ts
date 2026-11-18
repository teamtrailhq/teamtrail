import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

// what loads the managed sign-in reads the page's address
const origin = 'https://cloud.example.test';
vi.hoisted(() =>
  Object.assign(globalThis, {
    location: { search: '', href: 'https://cloud.example.test/', origin: 'https://cloud.example.test' },
  }),
);

const at = { trail: 'm1', ticket: '3' };
const minute = 60_000;
const waiting = (over: Record<string, unknown> = {}) => ({
  trail: 'm1',
  ticket: '3',
  repo: 'acme/app',
  pr: 12,
  url: 'https://github.com/acme/app/pull/12',
  head: 'a'.repeat(40),
  why: 'Checks still running on GitHub: build.',
  at: Date.now() - 5 * minute,
  ...over,
});
const merged = (over: Record<string, unknown> = {}) => {
  const { why: _why, ...rest } = waiting(over);
  return rest;
};
const body = (over: Record<string, unknown> = {}) => ({
  on: true,
  since: 0,
  merged: 0,
  merges: [],
  waiting: [],
  settings: '/_cloud/repos#auto-merge',
  ...over,
});

function page() {
  vi.stubGlobal('location', { href: `${origin}/`, origin, search: '' });
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("auto-merge on a ticket's pull request", () => {
  test('waiting: the reason in one line, and the setting on this origin only', async () => {
    page();
    const { ticketAutoMergeOf } = await import('../src/lib/ticketAutoMergeOf');
    const why = '  Checks still running\non GitHub:   build.  ';
    expect(ticketAutoMergeOf(body({ waiting: [waiting({ why })] }), at)).toEqual({
      kind: 'waiting',
      why: 'Checks still running on GitHub: build.',
      settings: '/_cloud/repos#auto-merge',
    });
    for (const settings of ['//evil.test/x', 'https://evil.test/x', 'javascript:alert(1)'])
      expect(ticketAutoMergeOf(body({ settings, waiting: [waiting()] }), at)).toMatchObject({ settings: undefined });
  });

  test('merged: when, and the pull request only as a web URL', async () => {
    page();
    const { ticketAutoMergeOf } = await import('../src/lib/ticketAutoMergeOf');
    const when = Date.now() - 3 * minute;
    expect(ticketAutoMergeOf(body({ merges: [merged({ at: when })] }), at)).toEqual({
      kind: 'merged',
      at: when,
      url: 'https://github.com/acme/app/pull/12',
    });
    const bad = ticketAutoMergeOf(body({ merges: [merged({ url: 'javascript:alert(1)' })] }), at);
    expect(bad).toMatchObject({ kind: 'merged', url: undefined });
  });

  test("nothing while it is off, for another ticket's entries, or for malformed ones", async () => {
    page();
    const { ticketAutoMergeOf } = await import('../src/lib/ticketAutoMergeOf');
    const none = { kind: 'none' };
    expect(ticketAutoMergeOf(body({ on: false, waiting: [waiting()], merges: [merged()] }), at)).toEqual(none);
    expect(ticketAutoMergeOf(body({ waiting: [waiting({ ticket: '4' })] }), at)).toEqual(none);
    expect(ticketAutoMergeOf(body({ waiting: [waiting({ trail: 'm2' })] }), at)).toEqual(none);
    expect(ticketAutoMergeOf(body({ waiting: [waiting({ why: '' }), waiting({ at: 'soon' })] }), at)).toEqual(none);
    expect(ticketAutoMergeOf(body({ waiting: 'x', merges: null }), at)).toEqual(none);
    expect(ticketAutoMergeOf(null, at)).toEqual(none);
  });

  test('the newest of its entries wins: a new pull request can wait after an older one merged', async () => {
    page();
    const { ticketAutoMergeOf } = await import('../src/lib/ticketAutoMergeOf');
    const older = merged({ at: Date.now() - 60 * minute });
    expect(ticketAutoMergeOf(body({ merges: [older], waiting: [waiting()] }), at).kind).toBe('waiting');
    const newer = merged({ at: Date.now() });
    expect(ticketAutoMergeOf(body({ merges: [newer], waiting: [waiting()] }), at).kind).toBe('merged');
  });

  test('asked of the server behind a managed sign-in only; the Lookout on its own asks nothing', async () => {
    const fetch = page();
    const { learnManagedSignIn } = await import('../src/lib/managedSignIn');
    const { loadTicketAutoMerge } = await import('../src/lib/loadTicketAutoMerge');
    expect(await loadTicketAutoMerge(at)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], autoMerge: '/_cloud/auto-merge' } });
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(body({ waiting: [waiting()] }))));
    expect(await loadTicketAutoMerge(at)).toMatchObject({ kind: 'waiting' });
    expect(fetch.mock.calls.at(-1)?.[0]).toBe('/_cloud/auto-merge?trail=m1&ticket=3');
    fetch.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    expect(await loadTicketAutoMerge(at)).toBeUndefined();
  });

  test('the line under the pull request', async () => {
    page();
    const { AutoMergeLine } = await import('../src/features/pr-sync/AutoMergeLine');
    const line = (auto: unknown, prUrl?: string) =>
      renderToStaticMarkup(createElement(AutoMergeLine, { auto, prUrl } as Parameters<typeof AutoMergeLine>[0]));
    const waits = line({ kind: 'waiting', why: '<b>Behind</b> its base', settings: '/_cloud/repos#auto-merge' });
    expect(waits).toContain('Auto-merge waits: &lt;b&gt;Behind&lt;/b&gt; its base');
    expect(waits).toContain('href="/_cloud/repos#auto-merge"');
    expect(line({ kind: 'merged', at: Date.now() - 5 * minute }, 'https://github.com/acme/app/pull/12')).toMatch(
      /Merged automatically 5 min ago<\/p>$/,
    );
    expect(line({ kind: 'merged', at: Date.now(), url: 'https://github.com/acme/app/pull/12' })).toContain(
      'See the pull request',
    );
    expect(line({ kind: 'none' })).toBe('');
    expect(line(undefined)).toBe('');
  });
});
