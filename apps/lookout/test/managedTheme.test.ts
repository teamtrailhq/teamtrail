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

  test('a person who may not make high-risk calls is routed to someone who may; anything but false says nothing', () => {
    page();
    learnManagedSignIn({ managed: { name: 'Grace', pages: [], highRisk: false } });
    expect(managedSignIn()?.highRisk).toBe(false);
    for (const highRisk of [true, undefined, 'false', 0]) {
      page();
      learnManagedSignIn({ managed: { name: 'Grace', pages: [], highRisk } });
      expect(managedSignIn()?.highRisk).toBeUndefined();
    }
  });

  test("the server's home link is kept only as a short label and a web address", () => {
    page();
    learnManagedSignIn({
      managed: { name: 'Ada', pages: [], home: { label: 'Teamtrail Cloud', href: 'https://app.teamtrail.app/' } },
    });
    expect(managedSignIn()?.home).toEqual({ label: 'Teamtrail Cloud', href: 'https://app.teamtrail.app/' });
    for (const home of [
      { label: 'x', href: 'javascript:alert(1)' },
      { label: '', href: 'https://a.b/' },
      { label: 'x'.repeat(61), href: 'https://a.b/' },
      'https://a.b/',
    ]) {
      page();
      learnManagedSignIn({ managed: { name: 'Ada', pages: [], home } });
      expect(managedSignIn()?.home).toBeUndefined();
    }
  });

  test('a server that keeps the trails itself says so; anything else is the Lookout choosing as usual', () => {
    page();
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], tracker: 'markdown' } });
    expect(managedSignIn()?.tracker).toBe('markdown');
    for (const tracker of ['github', 'linear', true, undefined]) {
      page();
      learnManagedSignIn({ managed: { name: 'Ada', pages: [], tracker } });
      expect(managedSignIn()?.tracker).toBeUndefined();
    }
  });

  test("the server's agents page is kept only on this origin", () => {
    page();
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], agents: { label: 'Agents', href: '/_cloud/agents' } } });
    expect(managedSignIn()?.agents?.label).toBe('Agents');
    for (const agents of [{ label: 'Agents', href: 'https://evil.example/agents' }, { label: 'Agents' }, 'Agents']) {
      page();
      learnManagedSignIn({ managed: { name: 'Ada', pages: [], agents } });
      expect(managedSignIn()?.agents).toBeUndefined();
    }
  });
});

describe('a theme picked here is saved on the server, when it says where', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('only a path on this origin is kept as the place to save it', () => {
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], theme: 'day', themeSave: '/_cloud/theme' } });
    expect(managedSignIn()?.themeSave).toBe('/_cloud/theme');
    for (const themeSave of ['https://evil.example/theme', '//evil.example/theme', 'javascript:x', '/a b', 1]) {
      learnManagedSignIn({ managed: { name: 'Ada', pages: [], theme: 'day', themeSave } });
      expect(managedSignIn()?.themeSave).toBeUndefined();
    }
  });

  test('picked here: applied at once, posted to the server, and the controls stay; without a place, it stays fixed', async () => {
    const { managedThemeFixed, saveManagedTheme, shownTheme } = await import('../src/lib/managedTheme');
    const dataset: Record<string, string> = {};
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset } });
    const posts: { url: string; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      async (url: string, init: { body: string }) => (
        posts.push({ url, body: init.body }),
        new Response(null, { status: 204 })
      ),
    );
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], theme: 'day', themeSave: '/_cloud/theme' } });
    expect(managedThemeFixed()).toBe(false);
    saveManagedTheme('night');
    expect(dataset.theme).toBe('night');
    expect(shownTheme('day')).toBe('night');
    expect(posts).toEqual([{ url: '/_cloud/theme', body: '{"theme":"night"}' }]);
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], theme: 'day' } });
    expect(managedThemeFixed()).toBe(true);
    saveManagedTheme('night');
    expect(posts).toHaveLength(1);
  });
});

describe('a server that merges pull requests says where', () => {
  afterEach(() => vi.unstubAllGlobals());
  test('only a path on this origin is kept', () => {
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], merge: '/_cloud/merge' } });
    expect(managedSignIn()?.merge).toBe('/_cloud/merge');
    for (const merge of ['https://evil.example/merge', '//evil.example/m', 'javascript:x', 1]) {
      learnManagedSignIn({ managed: { name: 'Ada', pages: [], merge } });
      expect(managedSignIn()?.merge).toBeUndefined();
    }
  });
});

describe('a server that tracks setup says where', () => {
  afterEach(() => vi.unstubAllGlobals());
  test('only a path on this origin is kept', () => {
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], setup: '/_cloud/setup' } });
    expect(managedSignIn()?.setup).toBe('/_cloud/setup');
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], setup: 'https://evil.example/setup' } });
    expect(managedSignIn()?.setup).toBeUndefined();
  });
});

describe('a server that starts agents from here says where', () => {
  afterEach(() => vi.unstubAllGlobals());
  test('only a path on this origin is kept', () => {
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], trailAgents: '/_cloud/agents/trail' } });
    expect(managedSignIn()?.trailAgents).toBe('/_cloud/agents/trail');
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], trailAgents: 'https://evil.example/x' } });
    expect(managedSignIn()?.trailAgents).toBeUndefined();
  });
});
