import { escapeHtml } from '../html/escapeHtml';
import { isCurrent } from './isCurrent';
import { type SiteLink } from './types';

/** One link of the site, its address on `base`, marked current when it is the page's. */
export function navLink(o: { link: SiteLink; base: string; path?: string }) {
  const current = isCurrent(o.link.path, o.path) ? ' aria-current="page"' : '';
  return `<a href="${escapeHtml(o.base + o.link.path)}"${current}>${escapeHtml(o.link.label)}</a>`;
}
