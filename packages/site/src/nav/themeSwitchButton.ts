import { escapeHtml } from '../html/escapeHtml';
import { NAV_ICONS } from './navIcons';

/**
 * The sun and moon button. The browser script (browser/themeSwitch.ts) flips the theme and writes the shared
 * `tt_theme` cookie, on `cookieDomain` when given. Its label says what a press does once the script runs.
 */
export function themeSwitchButton(o: { cookieDomain?: string } = {}) {
  const domain = o.cookieDomain ? ` data-theme-domain="${escapeHtml(o.cookieDomain)}"` : '';
  return `<button class="site-theme" type="button" data-theme-switch${domain} aria-label="Switch to night theme">${NAV_ICONS.sun}${NAV_ICONS.moon}</button>`;
}
