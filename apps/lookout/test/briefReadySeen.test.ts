import type { DiscoveryBrief } from '@teamtrail/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { briefReadySeen } from '../src/features/discovery/briefReadySeen';

const brief = (submittedAt: number, mapId = 'm1') => ({ mapId, status: 'submitted', submittedAt }) as DiscoveryBrief;

describe('the research-is-done dialog, once per brief', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test('remembers a brief it showed, in the page storage', () => {
    expect(briefReadySeen.has(brief(1))).toBe(false);
    briefReadySeen.add(brief(1));
    expect(briefReadySeen.has(brief(1))).toBe(true);
    expect(store.size).toBe(1);
  });

  test('a resubmitted brief, or another trail’s, shows again', () => {
    briefReadySeen.add(brief(2));
    expect(briefReadySeen.has(brief(3))).toBe(false);
    expect(briefReadySeen.has(brief(2, 'm2'))).toBe(false);
  });

  test('blocked storage: shown once for this page load, no throw', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(briefReadySeen.has(brief(4))).toBe(false);
    briefReadySeen.add(brief(4));
    expect(briefReadySeen.has(brief(4))).toBe(true);
  });
});
