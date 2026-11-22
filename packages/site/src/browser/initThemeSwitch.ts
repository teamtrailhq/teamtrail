import { type ThemeControl } from './types';

/** Every sun and moon button on the page: a press flips the theme; the label says what the next press does. */
export function initThemeSwitch(theme: ThemeControl) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-switch]'));
  const label = () => {
    const text = theme.isNight() ? 'Switch to day theme' : 'Switch to night theme';
    for (const button of buttons) button.setAttribute('aria-label', text);
  };
  theme.mark();
  label();
  theme.onChange(label);
  for (const button of buttons) {
    const cookieDomain = button.dataset.themeDomain || undefined;
    button.addEventListener('click', () => theme.choose({ night: !theme.isNight(), cookieDomain }));
  }
}
