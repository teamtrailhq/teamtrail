import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PrNoSyncBlock } from '../src/features/pr-sync/PrNoSyncBlock';
import { prNumberOf } from '../src/lib/prNumberOf';
import { prSync } from '../src/lib/prSync';

vi.mock('../src/lib/trackerChanges', () => ({
  onStreamOpen: () => () => undefined,
  onStreamDrop: () => () => undefined,
  onServerEvent: () => () => undefined,
}));

const settle = () => new Promise((r) => setTimeout(r, 0));
const sync = (pr: number) => ({
  v: 1 as const,
  mapId: 'm',
  ticketId: '5',
  ticketKey: '#5',
  provider: 'github',
  link: { number: pr, source: 'explicit' as const, at: 1 },
  checks: [],
  checksSummary: 'none' as const,
  flags: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('linking a pull request by hand', () => {
  test('a number, #number or the PR’s link in this repo; anything else says why', () => {
    expect(prNumberOf('12', 'acme/app')).toEqual({ kind: 'number', pr: 12 });
    expect(prNumberOf(' #12 ', 'acme/app')).toEqual({ kind: 'number', pr: 12 });
    expect(prNumberOf('https://github.com/Acme/App/pull/12/files', 'acme/app')).toEqual({ kind: 'number', pr: 12 });
    expect(prNumberOf('https://github.com/acme/app/pull/12#issuecomment-1', 'acme/app')).toEqual({
      kind: 'number',
      pr: 12,
    });
    expect(prNumberOf('https://github.com/other/app/pull/12', 'acme/app')).toMatchObject({
      kind: 'invalid',
      why: expect.stringContaining('other/app'),
    });
    for (const bad of ['', 'twelve', '0', '#-3', 'https://github.com/acme/app/issues/12', '99999999999'])
      expect(prNumberOf(bad, 'acme/app').kind).toBe('invalid');
  });

  test('an unlink is shown at once, and a load that started before it never brings the PR back', async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal('location', { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', search: '' });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (answer = r))),
    );
    const unsubscribe = prSync.subscribe(() => {});
    prSync.push(sync(7));
    expect(prSync.ticket(prSync.get(), 'm', '5')?.link.number).toBe(7);
    prSync.drop('m', '5');
    expect(prSync.ticket(prSync.get(), 'm', '5')).toBeUndefined();
    // the first load, started before the unlink, still has the PR
    answer(new Response(JSON.stringify({ status: { state: 'ok' }, tickets: [sync(7)] })));
    await settle();
    await settle();
    expect(prSync.get().reached).toBe(true);
    expect(prSync.ticket(prSync.get(), 'm', '5')).toBeUndefined();
    unsubscribe();
  });
});

describe('auto-merge before PR sync has the pull request', () => {
  const block = (auto: unknown, offerLink = false) =>
    renderToStaticMarkup(
      createElement(PrNoSyncBlock, { mapId: 'm', ticketId: '5', auto, offerLink } as Parameters<
        typeof PrNoSyncBlock
      >[0]),
    );

  test('the server’s line shows on its own: why it waits, or that it merged', () => {
    expect(block({ kind: 'waiting', why: 'Checks still running on GitHub: build.' })).toContain(
      'Auto-merge waits: Checks still running on GitHub: build.',
    );
    const merged = block({ kind: 'merged', at: Date.now(), url: 'https://github.com/acme/app/pull/12' });
    expect(merged).toContain('Merged automatically');
    expect(merged).toContain('href="https://github.com/acme/app/pull/12"');
  });

  test('nothing to say: no block (the link offer waits for this machine)', () => {
    expect(block({ kind: 'none' })).toBe('');
    expect(block(undefined)).toBe('');
    expect(block(undefined, true)).toBe('');
  });
});
