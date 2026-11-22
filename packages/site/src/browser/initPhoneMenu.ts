/**
 * The phone nav (860px and narrower, where the top links are hidden): a Menu button that opens every link plus the
 * theme, Install and Star. Closes on a link, Escape, a tap outside, or when the window grows past the phone layout.
 */
export function initPhoneMenu(nav: HTMLElement) {
  const button = nav.querySelector<HTMLButtonElement>('.site-nav__burger');
  const panel = nav.querySelector<HTMLElement>('.site-nav__phone');
  if (!button || !panel) return;
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    nav.classList.toggle('is-menu-open', open);
  };
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  button.addEventListener('click', () => setOpen(!isOpen()));
  for (const link of panel.querySelectorAll('a')) link.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    button.focus();
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !nav.contains(e.target as Node)) setOpen(false);
  });
  window.matchMedia('(min-width: 861px)').addEventListener('change', (m) => {
    if (m.matches) setOpen(false);
  });
}
