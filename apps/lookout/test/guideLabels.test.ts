import type { GuideLockEntry, InstalledGuide } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { isHandWritten, sourceLabel, statusPart } from '../src/features/guides/guideLabels';

const lock = (source: GuideLockEntry['source']): GuideLockEntry => ({
  version: '1.0.0',
  sha256: 'sha256:x',
  source,
  addedAt: '2026-11-09T00:00:00Z',
  addedBy: 'trail lead',
  approvedChecks: {},
  requiresChecks: [],
});
const guide = (o: Partial<InstalledGuide>): InstalledGuide => ({
  id: 'perf',
  origin: 'local',
  status: 'active',
  findings: [],
  pendingChecks: [],
  overridesBuiltin: false,
  ...o,
});

describe('guide labels', () => {
  it('tells your own guides from built-in and catalog ones', () => {
    expect(isHandWritten(guide({ status: 'unapproved' }))).toBe(true);
    expect(isHandWritten(guide({ lock: lock('local') }))).toBe(true);
    expect(isHandWritten(guide({ lock: lock({ registry: 'https://x.example', path: 'guides/perf.md' }) }))).toBe(false);
    expect(isHandWritten(guide({ origin: 'builtin' }))).toBe(false);
  });

  it('says Local, then Not approved yet or Approved, for your own guides', () => {
    expect(sourceLabel(guide({ status: 'unapproved' }))).toBe('Local');
    expect(statusPart(guide({ status: 'unapproved' }))).toEqual({ text: 'Not approved yet', strong: false });
    expect(statusPart(guide({ lock: lock('local') }))).toEqual({ text: 'Approved', strong: true });
    expect(statusPart(guide({ status: 'tampered', lock: lock('local') }))).toMatchObject({
      text: 'Changed since you approved it',
    });
  });

  it('shows a catalog or built-in guide its status only when it is not active', () => {
    const catalog = lock({ registry: 'https://x.example', path: 'guides/perf.md' });
    expect(statusPart(guide({ lock: catalog }))).toBeUndefined();
    expect(statusPart(guide({ origin: 'builtin' }))).toBeUndefined();
    expect(statusPart(guide({ lock: catalog, status: 'tampered' }))).toBe('Changed since you approved it');
  });
});
