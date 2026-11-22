/** Product ▾ opens on hover and keyboard focus (nav.css); a tap or click toggles it too, for touch screens. */
export function initNavMenus(nav: HTMLElement) {
  for (const button of nav.querySelectorAll<HTMLButtonElement>('.site-nav__group-btn')) {
    const group = button.parentElement;
    if (!group) continue;
    const setOpen = (open: boolean) => {
      group.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', () => setOpen(!group.classList.contains('is-open')));
    group.addEventListener('mouseleave', () => setOpen(false));
    group.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.focus();
    });
    document.addEventListener('click', (e) => {
      if (!group.contains(e.target as Node)) setOpen(false);
    });
  }
}
