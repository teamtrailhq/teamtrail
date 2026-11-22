import { escapeHtml } from '../html/escapeHtml';
import { githubButton } from './githubButton';
import { isCurrent } from './isCurrent';
import { NAV_ICONS } from './navIcons';
import { navLink } from './navLink';
import { phoneMenu } from './phoneMenu';
import { siteBrand } from './siteBrand';
import { SITE_LINKS } from './siteLinks';
import { themeSwitchButton } from './themeSwitchButton';
import { type SiteNavOptions } from './types';

const BURGER = `<button class="site-nav__burger" type="button" aria-expanded="false" aria-controls="site-nav-phone" aria-label="Menu"><span aria-hidden="true"></span><span aria-hidden="true"></span></button>`;

/** Product ▾: opens on hover and keyboard focus (nav.css), and on a tap (browser/navMenus.ts). */
function productGroup(o: { base: string; path?: string }) {
  const current = SITE_LINKS.product.some((link) => isCurrent(link.path, o.path)) ? ' is-current' : '';
  const links = SITE_LINKS.product.map((link) => navLink({ link, ...o })).join('');
  const button = `<button class="site-nav__group-btn" type="button" aria-expanded="false" aria-controls="site-nav-product">Product${NAV_ICONS.chevron}</button>`;
  return `<div class="site-nav__group${current}">${button}<div class="site-nav__menu" id="site-nav-product">${links}</div></div>`;
}

/**
 * teamtrail.app's top bar, as HTML: the wordmark; Product ▾, Cloud, Docs and FAQ centred; then Sign in when the
 * page has it, the theme toggle and the GitHub button; and on a phone a Menu button with every link. The site renders
 * it at build time, Cloud's welcome page on the server, so both are the same bar. Styles: nav.css, navPhone.css.
 */
export function siteNav(o: SiteNavOptions = {}) {
  const base = o.base ?? '';
  const main = SITE_LINKS.main.map((link) => navLink({ link, base, path: o.path })).join('');
  const signIn = o.signIn
    ? `<a class="site-btn site-btn--sm site-nav__signin" href="${escapeHtml(o.signIn.href)}">Sign in</a>`
    : '';
  const theme = themeSwitchButton({ cookieDomain: o.themeCookieDomain });
  const cta = `<div class="site-nav__cta">${signIn}${theme}${githubButton({ words: false })}</div>`;
  const links = `<nav class="site-nav__links" aria-label="Main">${productGroup({ base, path: o.path })}${main}</nav>`;
  const bar = `<div class="site-wrap site-nav__inner">${siteBrand({ base })}${links}${cta}${BURGER}</div>`;
  return `<header class="site-nav" id="site-nav" data-site-nav>${bar}${phoneMenu({ ...o, base })}</header>`;
}
