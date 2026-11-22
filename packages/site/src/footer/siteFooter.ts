import { escapeHtml } from '../html/escapeHtml';
import { navLink } from '../nav/navLink';
import { siteBrand } from '../nav/siteBrand';
import { SITE_LINKS } from '../nav/siteLinks';

/** The site's footer: the wordmark, every page with Install first and Privacy last, and the copyright. */
export function siteFooter(o: { base?: string; year?: number } = {}) {
  const base = o.base ?? '';
  const all = [SITE_LINKS.install, ...SITE_LINKS.product, ...SITE_LINKS.main, SITE_LINKS.privacy];
  const links = all.map((link) => navLink({ link, base })).join('');
  const year = escapeHtml(String(o.year ?? 2026));
  const brand = siteBrand({ base });
  return `<footer class="site-footer"><div class="site-wrap site-footer__inner">${brand}<nav aria-label="Footer">${links}</nav><span>© ${year} <span class="site-footer__name">Teamtrail</span></span></div></footer>`;
}
