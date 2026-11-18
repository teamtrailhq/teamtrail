import type { TrailChecksView, TrailRun } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { trailChecksActions } from '../src/features/trail-checks/trailChecksActions';
import { trailChecksText } from '../src/features/trail-checks/trailChecksText';

vi.hoisted(() => vi.stubGlobal('location', { search: '' }));

const run: TrailRun = {
  v: 1,
  id: 'T-1',
  mapId: 'm',
  commit: 'abc1234def',
  branch: 'main',
  startedAt: 0,
  finishedAt: 1000,
  configHash: 'h',
  checks: [
    { name: 'test', argv: ['npm', 'test'], passed: false, exitCode: 1, timedOut: false, durationMs: 5, tail: '' },
  ],
  result: 'fail',
  by: 'Teamtrail',
  merges: [],
  complete: true,
  key: 'k',
};
const view = (state: TrailChecksView['state'], r: TrailRun | undefined = run): TrailChecksView => ({
  mapId: 'm',
  state,
  together: { kind: 'pending', reason: '' },
  merges: [],
  ...(r ? { run: r } : {}),
});
const runners = { run: () => {}, fixTicket: () => {} };
const labels = (v: TrailChecksView) => {
  const a = trailChecksActions(v, runners);
  return { buttons: a.buttons.map((b) => b.label), menu: a.menu.map((m) => m.label) };
};

describe('the trail’s checks on main together', () => {
  it('fails red with every merge, offering a fix ticket and a new run', () => {
    const t = trailChecksText(view({ kind: 'failed', failing: ['test'] }), 61_000);
    expect(t.edge).toBe('urgent');
    expect(t.title).toBe('test fails on main with every merge');
    expect(labels(view({ kind: 'failed', failing: ['test'] })).buttons).toEqual(['Add a fix ticket', 'Run again']);
  });

  it('says the commit once when verified together', () => {
    const t = trailChecksText(view({ kind: 'passed' }, { ...run, result: 'pass' }), 61_000);
    expect(t.title).toBe('Verified together on main at abc1234');
    expect(JSON.stringify(t.context)).not.toContain('abc1234');
  });

  it('waits for the merges, with Run now labelled as not verifying anything', () => {
    const waiting = view({ kind: 'waiting', reason: 'waiting for PR #5 to merge.' }, { ...run, complete: false });
    const t = trailChecksText(waiting, 61_000);
    expect(t.title).toBe('Checks on main run once everything is merged');
    expect(t.detail).toBe('waiting for PR #5 to merge.');
    expect(t.context[0]).toBe('Last run failed, before everything was merged');
    expect(labels(waiting).menu).toEqual(['Run now on main as it is']);
    expect(trailChecksActions(waiting, runners).menu[0].tip).toMatch(/doesn't verify the trail/);
  });
});
