import { initNavMenus } from './initNavMenus';
import { initPhoneMenu } from './initPhoneMenu';
import { initThemeSwitch } from './initThemeSwitch';
import { type ThemeControl } from './types';

/**
 * The nav siteNav() wrote, brought to life: a background once the page scrolls, Product ▾ on a tap, the phone menu
 * and the theme toggle. A page without the nav still gets its theme buttons.
 */
export function initSiteNav(theme: ThemeControl) {
  initThemeSwitch(theme);
  const nav = document.querySelector<HTMLElement>('[data-site-nav]');
  if (!nav) return;
  const update = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  update();
  window.addEventListener('scroll', update, { passive: true });
  initNavMenus(nav);
  initPhoneMenu(nav);
}
