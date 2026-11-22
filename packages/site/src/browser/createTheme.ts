import { themeCookieString } from '../theme/themeCookieString';
import { type ThemeNames } from '../theme/types';
import { type ThemeControl } from './types';

/**
 * A page's theme in the browser: `names` are what it writes on `<html data-theme>`, `storageKey` where it keeps the
 * choice (none on Cloud, whose server renders the cookie's theme). Every choice also goes into the shared cookie.
 */
export function createTheme(o: { names: ThemeNames; storageKey?: string }): ThemeControl {
  const root = document.documentElement;
  const listeners = new Set<() => void>();
  const isNight = () => {
    const set = root.dataset.theme;
    if (set === o.names.night || set === o.names.day) return set === o.names.night;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const mark = () => {
    root.dataset.look = isNight() ? 'night' : 'day';
  };
  const keep = (name: string, cookie: string) => {
    try {
      if (o.storageKey) localStorage.setItem(o.storageKey, name);
      document.cookie = cookie;
    } catch {
      // Private windows can refuse storage; the choice still holds for this page.
    }
  };
  const choose: ThemeControl['choose'] = ({ night, cookieDomain }) => {
    const name = night ? o.names.night : o.names.day;
    root.dataset.theme = name;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', night ? 'dark' : 'light');
    const { hostname, protocol } = location;
    const theme = night ? 'dark' : 'light';
    keep(name, themeCookieString({ theme, hostname, https: protocol === 'https:', domain: cookieDomain }));
    mark();
    for (const listener of listeners) listener();
  };
  return { isNight, onChange: (listener) => void listeners.add(listener), choose, mark };
}
