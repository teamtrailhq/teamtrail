import { NAV_ICONS } from './navIcons';
import { SITE_LINKS } from './siteLinks';

const STARS = `<span class="site-gh-stars" data-gh-stars hidden>${NAV_ICONS.star}<span data-gh-count></span></span>`;

/**
 * The GitHub button: the mark and, once a page fills it in, the star count (the slot stays hidden until then). In
 * the bar it has no words and says what it is to screen readers; in the phone menu it says "Star on GitHub".
 */
export function githubButton(o: { words: boolean }) {
  const name = o.words ? '<span>Star on GitHub</span>' : '';
  const label = o.words ? '' : ' aria-label="Star Teamtrail on GitHub"';
  const size = o.words ? '' : ' site-btn--sm';
  return `<a class="site-btn${size}" href="${SITE_LINKS.repo}" target="_blank" rel="noopener"${label}>${NAV_ICONS.github}${name}${STARS}</a>`;
}
