const ARM = 'x="88" y="10" width="24" height="56"';
const ARMS = [60, 120, 180, 240, 300].map((deg) => `<rect ${ARM} transform="rotate(${deg} 100 100)"/>`).join('');

/**
 * The logo mark in the wordmark, inline: six block cursors around an open centre, the one pointing up grey, the
 * other five blaze, the same in both themes. The same shapes as scout-avatar's `logoMarkup()` (a test holds them
 * together); copied, since the site builds this package without installing the repo.
 */
export const LOGO_MARK_SVG = `<svg class="site-brand__mark" viewBox="0 0 200 200" aria-hidden="true" focusable="false"><g fill="#FF6B2C">${ARMS}</g><rect ${ARM} fill="#8E8E96"/></svg>`;
