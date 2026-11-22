import { escapeHtml } from '../html/escapeHtml';
import { LOGO_MARK_SVG } from './logoMark';

/** The wordmark, linking home: the logo mark, then `teamtrail` in Inter 600. */
export function siteBrand(o: { base: string }) {
  return `<a class="site-brand" href="${escapeHtml(o.base)}/" aria-label="Teamtrail home"><span class="site-brand__word" aria-hidden="true">${LOGO_MARK_SVG}teamtrail</span></a>`;
}
