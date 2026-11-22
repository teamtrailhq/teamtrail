import { type ThemeNames } from './types';

/**
 * The script a page runs first in `<head>`, inline, so it opens in its theme before anything is drawn: the shared
 * cookie, else the choice this site kept (`storageKey`), else `fallback` (a theme name, or none to follow the
 * system). Only the two names ever reach `data-theme`. A page that renders its theme on the server needs none.
 */
export function themeBootScript(o: { names: ThemeNames; storageKey: string; fallback?: string }) {
  const names = JSON.stringify(o.names);
  const key = JSON.stringify(o.storageKey);
  const fallback = JSON.stringify(o.fallback ?? '');
  return `try{var n=${names},m=document.cookie.match(/(?:^|; )tt_theme=(light|dark)(?:;|$)/),s=localStorage.getItem(${key}),t=m?(m[1]==='light'?n.day:n.night):s===n.day||s===n.night?s:${fallback};if(t)document.documentElement.dataset.theme=t}catch(e){if(${fallback})document.documentElement.dataset.theme=${fallback}}`;
}
