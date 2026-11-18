import { afterEach, describe, expect, it, vi } from 'vitest';
import { throttled } from '../src/lib/throttled';
import { trustChanged } from '../src/lib/trustChanged';
import { verificationOfTrail } from '../src/lib/verificationOfTrail';

describe('verificationOfTrail', () => {
  it("matches a ticket's evidence by the trail's file-safe id, as verificationEvents sends it", () => {
    expect(verificationOfTrail({ kind: 'evidence', mapId: 'ship_it', ticketId: '3' }, 'ship it')).toBe(true);
    expect(verificationOfTrail({ kind: 'evidence', mapId: 'other', ticketId: '3' }, 'ship it')).toBe(false);
  });

  it('matches PR sync that brought one of the trail’s tickets', () => {
    const sync = { kind: 'sync', status: {}, tickets: [{ mapId: 'm1', ticketId: '2' }] };
    expect(verificationOfTrail(sync, 'm1')).toBe(true);
    expect(verificationOfTrail(sync, 'm2')).toBe(false);
    expect(verificationOfTrail(undefined, 'm1')).toBe(false);
  });
});

describe('trustChanged', () => {
  it('tells approvals from signed records and accepted tracker settings', () => {
    expect(trustChanged({ files: ['approvals.json'] })).toEqual({ approvals: true, signed: false, accepted: false });
    expect(trustChanged({ files: ['signed-state/m.json'] })).toEqual({
      approvals: false,
      signed: true,
      accepted: false,
    });
    expect(trustChanged({ files: ['tracker-settings/map-1.json'] }).accepted).toBe(true);
    expect(trustChanged({})).toEqual({ approvals: false, signed: false, accepted: false });
  });
});

describe('throttled', () => {
  afterEach(() => vi.useRealTimers());

  it('runs the first call at once and merges the rest of the window into one', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const call = throttled(fn, 1000);
    call();
    call();
    call();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    call.cancel();
  });

  it('runs every call without a window', () => {
    const fn = vi.fn();
    const call = throttled(fn);
    call();
    call();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
