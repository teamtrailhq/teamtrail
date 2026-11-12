import { describe, expect, it } from 'vitest';
import { feedEdge } from '../src/features/activity/feedEdge';

describe('feedEdge', () => {
  it('marks what needs you now in red', () => {
    expect(feedEdge({ kind: 'asks-you', level: 'alert' })).toBe('urgent');
    expect(feedEdge({ kind: 'asks-you', level: 'warn' })).toBe('urgent');
  });

  it('marks what went well in green', () => {
    for (const kind of ['answered', 'launched', 'done', 'verified'] as const)
      expect(feedEdge({ kind, level: 'ok' })).toBe('good');
  });

  it('marks what is held up or at risk in amber', () => {
    for (const kind of ['checks-failed', 'stalled', 'disconnected', 'problem'] as const)
      expect(feedEdge({ kind, level: 'alert' })).toBe('attention');
  });

  it('leaves routine lines unmarked, whatever their level', () => {
    expect(feedEdge({ level: 'info' })).toBeUndefined();
    expect(feedEdge({ level: 'step' })).toBeUndefined();
    expect(feedEdge({ level: 'warn' })).toBeUndefined();
    expect(feedEdge({ level: 'alert' })).toBeUndefined();
    expect(feedEdge({ level: 'ok' })).toBeUndefined();
  });

  it('reads entries written before kinds by their signal', () => {
    expect(feedEdge({ level: 'alert', signal: true })).toBe('urgent');
    expect(feedEdge({ level: 'ok', signal: true })).toBe('good');
    expect(feedEdge({ level: 'info', signal: true })).toBeUndefined();
  });
});
