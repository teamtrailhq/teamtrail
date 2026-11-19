/**
 * What is wrong with one row of Needs you on a phone, measured in the page (`row.evaluate(measureNeed, { open })`):
 * anything outside the row's box, the page scrolling sideways, an action smaller than a 44px target, and an open body
 * taller than the screen that doesn't scroll inside it. Self-contained: it runs in the browser.
 */
export function measureNeed(row, { open }) {
  const problems = [];
  const box = row.getBoundingClientRect();
  const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').filter(Boolean).join('.')}`;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  for (const el of row.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.left < box.left - 1 || r.right > box.right + 1)
      problems.push(
        `${name(el)} ${Math.round(r.left)}–${Math.round(r.right)} outside ${Math.round(box.left)}–${Math.round(box.right)}`,
      );
  }
  if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push('the page scrolls sideways');
  const actions = 'button, a[href], select, input:not([type=hidden]), textarea, [role=button], summary';
  const body = row.querySelector('.home-need-body');
  // what is scrolled out of an open body's own view is reached by scrolling it, not measured where it lies
  const inView = (el) => {
    if (!body || !body.contains(el)) return true;
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.bottom > b.top && r.top < b.bottom;
  };
  for (const el of row.querySelectorAll(actions)) {
    if (!visible(el) || !inView(el) || el.disabled) continue;
    const r = el.getBoundingClientRect();
    const label = (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30);
    if (r.height < 43.5 || r.width < 43.5)
      problems.push(`"${label}" is ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  if (open && !body) problems.push('no body');
  if (open && body) {
    const screen = row.closest('.hands-off-home')?.clientHeight ?? window.innerHeight;
    const b = body.getBoundingClientRect();
    const scrolls =
      body.scrollHeight > body.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(body).overflowY);
    if (b.height > screen + 1 && !scrolls)
      problems.push(`the open body is ${Math.round(b.height)}px on a ${screen}px screen`);
    if (scrolls && b.height > screen + 1) problems.push(`the open body scrolls but is ${Math.round(b.height)}px tall`);
  }
  return problems;
}
