import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveLoad } from '../src/lib/liveLoad';

// the shared stream, faked: tests fire its opens, file changes and named events by hand
const stream = vi.hoisted(() => ({
  opened: new Set<() => void>(),
  changes: new Set<(path: string) => void>(),
  named: new Map<string, Set<(data: string) => void>>(),
}));

vi.mock('../src/lib/trackerChanges', () => {
  const add = <T>(set: Set<T>, l: T) => (set.add(l), () => void set.delete(l));
  return {
    onStreamOpen: (l: () => void) => add(stream.opened, l),
    onTrackerChange: (l: (path: string) => void) => add(stream.changes, l),
    onServerEvent: (name: string, l: (data: string) => void) => {
      const set = stream.named.get(name) ?? new Set();
      stream.named.set(name, set);
      return add(set, l);
    },
  };
});

const fire = {
  open: () => stream.opened.forEach((l) => l()),
  change: (path: string) => stream.changes.forEach((l) => l(path)),
  event: (name: string, data: unknown) => stream.named.get(name)?.forEach((l) => l(JSON.stringify(data))),
};

/** Loads that resolve when the test says so, in any order. */
function pendingLoads() {
  const waiting: ((value: string) => void)[] = [];
  const load = vi.fn(() => new Promise<string>((resolve) => waiting.push(resolve)));
  return { load, resolve: (i: number, value: string) => waiting[i](value) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  stream.opened.clear();
  stream.changes.clear();
  stream.named.clear();
});

describe('a live view', () => {
  it('loads at once, and again each time the stream opens', async () => {
    const shown: string[] = [];
    let n = 0;
    liveLoad({ load: async () => `v${++n}`, show: (v) => shown.push(v) });
    await settle();
    fire.open();
    await settle();
    fire.open();
    await settle();
    expect(shown).toEqual(['v1', 'v2', 'v3']);
  });

  it('reloads on its own files and events only', async () => {
    const load = vi.fn(async () => 'v');
    liveLoad({
      load,
      show: () => {},
      changed: (p) => p.startsWith('criteria/'),
      events: { reroute: (d) => (d as { mapId?: string }).mapId === 'trail' },
    });
    fire.change('criteria/trail.md');
    fire.change('knowledge/K-1.md');
    fire.event('reroute', { mapId: 'trail' });
    fire.event('reroute', { mapId: 'other' });
    fire.event('attention', {});
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('drops a load that lands after a newer one was shown', async () => {
    const { load, resolve } = pendingLoads();
    const shown: string[] = [];
    liveLoad({ load, show: (v) => shown.push(v) });
    fire.open();
    resolve(1, 'newer');
    resolve(0, 'older');
    await settle();
    expect(shown).toEqual(['newer']);
  });

  it('counts a value the server pushed as newer than loads started before it', async () => {
    const { load, resolve } = pendingLoads();
    const shown: string[] = [];
    const live = liveLoad({ load, show: (v) => shown.push(v) });
    live.pushed();
    resolve(0, 'older');
    live.reload();
    resolve(1, 'after');
    await settle();
    expect(shown).toEqual(['after']);
  });

  it('a failed load says so, unless something newer was shown', async () => {
    let fail = true;
    const failed = vi.fn();
    const live = liveLoad({
      load: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve('v')),
      show: () => {},
      failed,
    });
    await settle();
    expect(failed).toHaveBeenCalledTimes(1);
    fail = false;
    live.reload();
    await settle();
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('stops: unsubscribes from the stream and drops loads still on their way', async () => {
    const { load, resolve } = pendingLoads();
    const show = vi.fn();
    const live = liveLoad({ load, show, changed: () => true, events: { attention: () => true } });
    live.stop();
    resolve(0, 'late');
    await settle();
    expect(show).not.toHaveBeenCalled();
    expect(stream.opened.size + stream.changes.size + (stream.named.get('attention')?.size ?? 0)).toBe(0);
  });
});
