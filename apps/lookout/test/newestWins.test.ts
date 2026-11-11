import { describe, expect, it } from 'vitest';
import { newestWins } from '../src/lib/newestWins';

describe('overlapping loads are shown in the order they started', () => {
  it('drops a load that lands after a newer one was shown', () => {
    const order = newestWins();
    const older = order.start();
    const newer = order.start();
    expect(newer()).toBe(true);
    expect(older()).toBe(false);
  });

  it('shows loads that land in order, each once', () => {
    const order = newestWins();
    const first = order.start();
    const second = order.start();
    expect(first()).toBe(true);
    expect(second()).toBe(true);
    expect(second()).toBe(false);
  });

  it('a pushed view is newer than loads started before it, older than loads started after', () => {
    const order = newestWins();
    const before = order.start();
    order.pushed();
    const after = order.start();
    expect(before()).toBe(false);
    expect(after()).toBe(true);
  });
});
