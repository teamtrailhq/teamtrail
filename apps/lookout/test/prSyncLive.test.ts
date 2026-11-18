import { describe, expect, it, vi } from 'vitest';
import { prSync } from '../src/lib/prSync';

// the shared stream, faked: tests fire its named events by hand
const stream = vi.hoisted(() => ({ named: new Map<string, Set<(data: string) => void>>() }));

vi.mock('../src/lib/trackerChanges', () => ({
  onStreamOpen: () => () => undefined,
  onStreamDrop: () => () => undefined,
  onServerEvent: (name: string, l: (data: string) => void) => {
    const set = stream.named.get(name) ?? new Set();
    stream.named.set(name, set);
    set.add(l);
    return () => void set.delete(l);
  },
}));

const fire = (data: unknown) => stream.named.get('verification')?.forEach((l) => l(JSON.stringify(data)));
const settle = () => new Promise((r) => setTimeout(r, 0));

function sync(state: 'open' | 'merged') {
  return {
    v: 1,
    mapId: 'm',
    ticketId: '5',
    ticketKey: '#5',
    provider: 'Teamtrail Cloud',
    link: { number: 3, source: 'branch', at: 1 },
    pr: { number: 3, url: 'https://github.com/a/b/pull/3', title: '', state, draft: false, headSha: 'e'.repeat(40) },
    checks: [],
    checksSummary: 'none',
    flags: [],
  };
}

describe('PR snapshots, live', () => {
  it('reads them again when a ticket’s snapshot changed outside the reconciler, and not for other evidence', async () => {
    const served = [sync('open')];
    const fetched = vi.fn(async () => new Response(JSON.stringify({ status: { state: 'off' }, tickets: served })));
    vi.stubGlobal('location', { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', search: '' });
    vi.stubGlobal('fetch', fetched);
    const seen: (string | undefined)[] = [];
    const unsubscribe = prSync.subscribe(() => seen.push(prSync.ticket(prSync.get(), 'm', '5')?.pr?.state));
    await settle();
    expect(seen.at(-1)).toBe('open');
    fire({ kind: 'evidence', mapId: 'm', ticketId: '5' });
    await settle();
    expect(fetched).toHaveBeenCalledTimes(1);
    // merged in Cloud: the engine rewrote sync.json, and the watch says so
    served[0] = sync('merged');
    fire({ kind: 'evidence', mapId: 'm', ticketId: '5', sync: true });
    await settle();
    expect(fetched).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)).toBe('merged');
    // dropped: the next load has no snapshot for it
    served.length = 0;
    fire({ kind: 'evidence', mapId: 'm', ticketId: '5', sync: true });
    await settle();
    expect(prSync.ticket(prSync.get(), 'm', '5')).toBeUndefined();
    unsubscribe();
    vi.unstubAllGlobals();
  });
});
