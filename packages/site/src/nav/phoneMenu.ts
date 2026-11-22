import { escapeHtml } from '../html/escapeHtml';
import { githubButton } from './githubButton';
import { navLink } from './navLink';
import { SITE_LINKS } from './siteLinks';
import { themeSwitchButton } from './themeSwitchButton';
import { type SiteNavOptions } from './types';

/**
 * The phone's menu (860px and narrower): every link, Sign in when the page has it, then the theme toggle and
 * Install side by side and Star on GitHub across the row below. Hidden until the Menu button opens it.
 */
export function phoneMenu(o: SiteNavOptions & { base: string }) {
  const links = [...SITE_LINKS.product, ...SITE_LINKS.main].map((link) => navLink({ link, base: o.base }));
  const signIn = o.signIn ? `<a href="${escapeHtml(o.signIn.href)}">Sign in</a>` : '';
  const install = `<a class="site-btn site-btn--primary" href="${escapeHtml(o.base + SITE_LINKS.install.path)}">Install</a>`;
  const cta = `<div class="site-nav__phone-cta">${themeSwitchButton({ cookieDomain: o.themeCookieDomain })}${install}${githubButton({ words: true })}</div>`;
  return `<div class="site-nav__phone" id="site-nav-phone" hidden><nav class="site-wrap site-nav__phone-links" aria-label="Main">${links.join('')}${signIn}${cta}</nav></div>`;
}
