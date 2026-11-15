import { afterEach, describe, expect, test, vi } from 'vitest';
import { learnManagedSignIn, managedSignIn } from '../src/lib/managedSignIn';

const origin = 'https://demo.example.test';

describe("a server's own sign-in carries the person's theme", () => {
  afterEach(() => vi.unstubAllGlobals());
  function page() {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset } });
    return dataset;
  }

  test('a known theme is applied at once and kept for the Lookout to follow', () => {
    const dataset = page();
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], theme: 'day' } });
    expect(dataset.theme).toBe('day');
    expect(managedSignIn()?.theme).toBe('day');
  });

  test('none, or anything else, leaves the browser’s own setting alone', () => {
    for (const theme of [undefined, 'neon', 1, '<b>day</b>']) {
      const dataset = page();
      learnManagedSignIn({ managed: { name: 'Ada', pages: [], theme } });
      expect(dataset.theme).toBeUndefined();
      expect(managedSignIn()?.theme).toBeUndefined();
    }
  });
});
