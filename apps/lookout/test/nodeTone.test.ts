import { describe, expect, it } from 'vitest';
import { nodeTone } from '../src/features/map/nodeTone';

describe('nodeTone', () => {
  it('gives each state its dot', () => {
    expect(nodeTone({ state: 'claimed', live: false, attention: false })).toBe('working');
    expect(nodeTone({ state: 'verifying', live: false, attention: false })).toBe('working');
    expect(nodeTone({ state: 'frontier', live: false, attention: false })).toBe('ready');
    expect(nodeTone({ state: 'blocked', live: false, attention: false })).toBe('backlog');
    expect(nodeTone({ state: 'parked', live: false, attention: false })).toBe('backlog');
    expect(nodeTone({ state: 'decided', live: false, attention: false })).toBe('done');
    expect(nodeTone({ state: 'out-of-scope', live: false, attention: false })).toBe('cancelled');
    expect(nodeTone({ state: 'rework', live: false, attention: false })).toBe('attention');
    expect(nodeTone({ state: 'held', live: false, attention: false })).toBe('attention');
  });

  it('turns amber when the ticket waits on a person, before showing the agent at work', () => {
    expect(nodeTone({ state: 'claimed', live: true, attention: true })).toBe('attention');
    expect(nodeTone({ state: 'frontier', live: false, attention: true })).toBe('attention');
  });

  it('shows a live session as working', () => {
    expect(nodeTone({ state: 'frontier', live: true, attention: false })).toBe('working');
  });

  it('keeps done and cancelled quiet whatever else is going on', () => {
    expect(nodeTone({ state: 'decided', live: true, attention: true })).toBe('done');
    expect(nodeTone({ state: 'out-of-scope', live: false, attention: true })).toBe('cancelled');
  });
});
