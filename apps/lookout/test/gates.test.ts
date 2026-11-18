import { GATE_NAMES } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { gateActivityLine } from '../src/features/gates/gateActivityLine';
import { gateLock } from '../src/features/gates/gateLock';
import { gateAbout, gateTitle } from '../src/features/gates/gateText';
import { parseSettingsRoute } from '../src/features/settings/parseSettingsRoute';

describe('Settings → Gates', () => {
  it('opens at ?settings=gates, in the trail group next to Verification', () => {
    expect(parseSettingsRoute('gates')).toEqual({ group: 'trail', section: 'gates' });
  });

  it('names every known gate and describes it in a line; an unknown gate keeps its raw name', () => {
    for (const g of GATE_NAMES) {
      expect(gateTitle(g)).not.toBe(g);
      expect(gateAbout(g)).toMatch(/\.$/);
    }
    expect(gateTitle('tests-added')).toBe('tests-added');
    expect(gateAbout('tests-added')).toBeUndefined();
  });

  it('says what a gate did in the last stretch, in one line', () => {
    expect(gateActivityLine({ held: 0, wouldHold: 0 }, 14)).toBe('Nothing held in the last 14 days');
    expect(gateActivityLine({ held: 2, wouldHold: 0 }, 14)).toBe('Held 2 tickets in the last 14 days');
    expect(gateActivityLine({ held: 0, wouldHold: 1 }, 14)).toBe('Would have held 1 ticket in the last 14 days');
    expect(gateActivityLine({ held: 1, wouldHold: 3 }, 14)).toBe(
      'Held 1 ticket, would have held 3 tickets in the last 14 days',
    );
  });

  it('opens the controls only on this machine, over checks that are there, valid and approved', () => {
    const ok = { local: true, exists: true, valid: true, waiting: false };
    expect(gateLock(ok)).toEqual({ kind: 'open' });
    expect(gateLock({ ...ok, local: false })).toEqual({
      kind: 'locked',
      reason: 'Set on the machine Teamtrail runs on.',
    });
    expect(gateLock({ ...ok, exists: false })).toMatchObject({ reason: /Set the checks first/ });
    expect(gateLock({ ...ok, valid: false })).toMatchObject({ reason: /Fix verification.json/ });
    expect(gateLock({ ...ok, waiting: true })).toMatchObject({ reason: /Approve the checks first/ });
    expect(gateLock({ ...ok, local: undefined })).toEqual({ kind: 'locked' });
  });
});
