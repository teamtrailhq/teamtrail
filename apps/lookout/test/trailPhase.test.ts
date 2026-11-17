import { describe, expect, it } from 'vitest';
import { trailPhase } from '../src/features/inspector/trailPhase';

describe('trailPhase', () => {
  it('reads Discovery, then Brief, while discovery holds the trail', () => {
    expect(trailPhase({ done: false, gated: true, briefStatus: 'draft', states: ['claimed'] })).toBe('discovery');
    expect(trailPhase({ done: false, gated: true, briefStatus: 'submitted', states: [] })).toBe('brief');
  });

  it('reads Review once every open ticket waits on verification', () => {
    const states = ['decided', 'verifying', 'held', 'out-of-scope'] as const;
    expect(trailPhase({ done: false, gated: false, states: [...states] })).toBe('review');
    expect(trailPhase({ done: false, gated: false, states: ['verifying', 'frontier'] })).toBe('building');
  });

  it('reads Done when trailDone says so', () => {
    expect(trailPhase({ done: true, gated: true, states: [] })).toBe('done');
  });
});
