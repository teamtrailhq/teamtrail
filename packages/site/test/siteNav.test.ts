import { expect, test } from 'vitest';
import { logoMarkup } from '../../scout-avatar/src/logo/logoMark';
import { siteFooter } from '../src/footer/siteFooter';
import { LOGO_MARK_SVG } from '../src/nav/logoMark';
import { siteNav } from '../src/nav/siteNav';

const HOSTILE = `"><script>alert(1)</script><a href="javascript:x`;

const links = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);

test('the nav lists the site, Product first, with the theme toggle and GitHub, and no Sign in unless asked', () => {
  const html = siteNav();
  expect(html).toContain('aria-controls="site-nav-product">Product');
  expect(
    links(html)
      .slice(0, 10)
      .map(([, label]) => label),
  ).toEqual(['', 'How it works', 'Features', 'Guides', 'Scout in Slack', 'Mobile', 'Cloud', 'Docs', 'FAQ', '']);
  expect(html).toContain('data-theme-switch');
  expect(html).toContain('aria-label="Star Teamtrail on GitHub"');
  expect(html).not.toContain('Sign in');
  expect(html).not.toContain('site-btn--primary site-nav');
});

test('Sign in is a bordered button first in the bar and a link in the phone menu, never the accent fill', () => {
  const html = siteNav({ signIn: { href: 'https://app.teamtrail.app/' } });
  const bar = html.slice(html.indexOf('site-nav__cta'), html.indexOf('site-nav__burger'));
  expect(bar.indexOf('Sign in')).toBeLessThan(bar.indexOf('data-theme-switch'));
  expect(bar).toContain('class="site-btn site-btn--sm site-nav__signin" href="https://app.teamtrail.app/"');
  expect(html.slice(html.indexOf('site-nav__phone"'))).toContain('<a href="https://app.teamtrail.app/">Sign in</a>');
});

test('links point at the site from elsewhere, and the page you are on reads as current', () => {
  const away = siteNav({ base: 'https://teamtrail.app' });
  expect(links(away).every(([href]) => href.startsWith('https://'))).toBe(true);
  const docs = siteNav({ path: '/docs/cli/' });
  expect(docs).toContain('<a href="/docs/" aria-current="page">Docs</a>');
  expect(docs).not.toContain('<a href="/#faq" aria-current');
  const guides = siteNav({ path: '/guides/' });
  expect(guides).toContain('site-nav__group is-current');
  expect(siteNav({ path: '/' })).not.toContain('aria-current');
});

test('every option is escaped where it is written', () => {
  const html = siteNav({ base: HOSTILE, path: HOSTILE, signIn: { href: HOSTILE }, themeCookieDomain: HOSTILE });
  expect(html).not.toContain('<script>');
  expect(html).not.toMatch(/href="javascript:/);
  expect(html).toContain('&quot;&gt;&lt;script&gt;');
  expect(siteFooter({ base: HOSTILE })).not.toContain('<script>');
});

test('the footer lists Install first and Privacy last', () => {
  const labels = links(siteFooter()).map(([, label]) => label);
  expect(labels[1]).toBe('Install');
  expect(labels[labels.length - 1]).toBe('Privacy');
});

test('the wordmark draws the logo as scout-avatar does', () => {
  const shapes = (svg: string) => svg.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  expect(shapes(LOGO_MARK_SVG)).toBe(shapes(`<svg>${logoMarkup()}</svg>`));
});
