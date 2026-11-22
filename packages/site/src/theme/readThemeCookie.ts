import { THEME_COOKIE } from './themeCookieName';
import { type SharedTheme } from './types';

/**
 * The shared theme in a Cookie header (or `document.cookie`): exactly `light` or `dark`. Anything else, and a cookie
 * sent twice (which would leave the choice to whoever set the second), is no choice at all.
 */
export function readThemeCookie(header: string | undefined): SharedTheme | undefined {
  const values = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${THEME_COOKIE}=`))
    .map((part) => part.slice(THEME_COOKIE.length + 1));
  if (values.length !== 1) return undefined;
  const [value] = values;
  if (value === 'light' || value === 'dark') return value;
  return undefined;
}
