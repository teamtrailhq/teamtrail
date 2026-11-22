import { THEME_COOKIE } from './themeCookieName';
import { type SharedTheme } from './types';

const SITE = /(^|\.)teamtrail\.app$/;

/**
 * The cookie a theme toggle writes: a year, SameSite=Lax, on the whole teamtrail.app domain from the site and from
 * Cloud, so each opens in the theme picked on the other, Secure there. `domain` names another shared domain; on any
 * other host (a preview, local development) it stays on that host, Secure only over https.
 */
export function themeCookieString(o: { theme: SharedTheme; hostname: string; https: boolean; domain?: string }) {
  const domain = o.domain ?? (SITE.test(o.hostname) ? 'teamtrail.app' : '');
  const shared = domain ? `; Domain=${domain}` : '';
  const secure = domain || o.https ? '; Secure' : '';
  return `${THEME_COOKIE}=${o.theme}; Path=/; Max-Age=31536000; SameSite=Lax${shared}${secure}`;
}
