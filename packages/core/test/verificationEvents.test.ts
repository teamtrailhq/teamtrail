import { afterEach, describe, expect, it, vi } from 'vitest';
import { verificationEvents } from '../src/server/verificationEvents';

const events = (sent: string[]) => sent.map((t) => JSON.parse(t.split('data: ')[1]) as Record<string, unknown>);

describe('verificationEvents', () => {
  afterEach(() => vi.useRealTimers());

  it('says when a burst held the ticket’s PR snapshot, written through its temp file or dropped', () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const notify = verificationEvents((t) => sent.push(t));
    notify('.evidence/trail/5/A-1/lint.log');
    notify('.evidence/trail/5/sync.json.4242.tmp');
    notify('.evidence/trail/5/sync.json');
    notify('.evidence/trail/6/A-2.json');
    vi.advanceTimersByTime(400);
    expect(events(sent)).toEqual([
      { kind: 'evidence', mapId: 'trail', ticketId: '5', sync: true },
      { kind: 'evidence', mapId: 'trail', ticketId: '6' },
    ]);
    notify('.evidence/trail/6/sync.json');
    vi.advanceTimersByTime(400);
    expect(events(sent)[2]).toEqual({ kind: 'evidence', mapId: 'trail', ticketId: '6', sync: true });
    notify.close();
  });

  it('a file named like a snapshot deeper down is evidence, not the snapshot', () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const notify = verificationEvents((t) => sent.push(t));
    notify('.evidence/trail/5/A-1/sync.json');
    vi.advanceTimersByTime(400);
    expect(events(sent)).toEqual([{ kind: 'evidence', mapId: 'trail', ticketId: '5' }]);
    notify.close();
  });
});
