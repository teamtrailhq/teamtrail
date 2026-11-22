import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { readThemeCookie } from '../src/theme/readThemeCookie';
import { themeBootScript } from '../src/theme/themeBootScript';
import { themeCookieString } from '../src/theme/themeCookieString';

test('only exactly light or dark counts, once', () => {
  expect(readThemeCookie('tt_theme=light')).toBe('light');
  expect(readThemeCookie('a=1; tt_theme=dark; b=2')).toBe('dark');
  for (const header of [
    undefined,
    '',
    'tt_theme=',
    'tt_theme=Dark',
    'tt_theme=dark;tt_theme=light',
    'tt_theme=x<script>',
  ])
    expect(readThemeCookie(header)).toBeUndefined();
  expect(readThemeCookie('xtt_theme=dark')).toBeUndefined();
});

test('the cookie is shared on teamtrail.app, Secure there; host-only elsewhere, Secure only over https', () => {
  const base = '; Path=/; Max-Age=31536000; SameSite=Lax';
  expect(themeCookieString({ theme: 'dark', hostname: 'www.teamtrail.app', https: true })).toBe(
    `tt_theme=dark${base}; Domain=teamtrail.app; Secure`,
  );
  expect(themeCookieString({ theme: 'light', hostname: 'app.teamtrail.app', https: true })).toBe(
    `tt_theme=light${base}; Domain=teamtrail.app; Secure`,
  );
  expect(themeCookieString({ theme: 'dark', hostname: 'teamtrail.app.evil.com', https: true })).toBe(
    `tt_theme=dark${base}; Secure`,
  );
  expect(themeCookieString({ theme: 'dark', hostname: 'app.localhost', https: false })).toBe(`tt_theme=dark${base}`);
  expect(themeCookieString({ theme: 'dark', hostname: 'app.example.com', https: true, domain: 'example.com' })).toBe(
    `tt_theme=dark${base}; Domain=example.com; Secure`,
  );
});

/** Runs the boot script with a cookie and a stored choice; what it put on `<html data-theme>`. */
function boot(o: { cookie: string; stored: string | null; fallback?: string; blocked?: boolean }) {
  const dataset: Record<string, string> = {};
  const localStorage = {
    getItem: () => {
      if (o.blocked) throw new Error('blocked');
      return o.stored;
    },
  };
  const script = themeBootScript({ names: { day: 'day', night: 'night' }, storageKey: 'k', fallback: o.fallback });
  runInNewContext(script, { document: { cookie: o.cookie, documentElement: { dataset } }, localStorage });
  return dataset.theme;
}

test('the boot script takes the cookie, then the stored choice, then the fallback', () => {
  expect(boot({ cookie: 'tt_theme=light', stored: 'night', fallback: 'night' })).toBe('day');
  expect(boot({ cookie: 'tt_theme=dark', stored: 'day', fallback: 'day' })).toBe('night');
  expect(boot({ cookie: '', stored: 'day', fallback: 'night' })).toBe('day');
  expect(boot({ cookie: 'tt_theme=x', stored: 'evil', fallback: 'night' })).toBe('night');
  expect(boot({ cookie: '', stored: null })).toBeUndefined();
  expect(boot({ cookie: '', stored: null, fallback: 'night', blocked: true })).toBe('night');
});
