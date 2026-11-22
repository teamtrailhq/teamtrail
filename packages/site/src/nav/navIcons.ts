const GITHUB_PATH =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';
const STAR_PATH =
  'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z';
const RAYS = 'M9 1v2.4M9 14.6V17M1 9h2.4M14.6 9H17M3.3 3.3L5 5M13 13l1.7 1.7M3.3 14.7L5 13M13 5l1.7-1.7';
const MOON_PATH = 'M15.2 11.4A6.9 6.9 0 0 1 6.6 2.8a6.9 6.9 0 1 0 8.6 8.6z';
const HIDDEN = 'aria-hidden="true" focusable="false"';

/** The nav's icons as inline SVG, drawn in currentColor (the star in --site-star). */
export const NAV_ICONS = {
  chevron: `<svg viewBox="0 0 10 6" ${HIDDEN}><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`,
  sun: `<svg class="site-theme__sun" viewBox="0 0 18 18" ${HIDDEN}><circle cx="9" cy="9" r="3.6" fill="currentColor"/><path d="${RAYS}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  moon: `<svg class="site-theme__moon" viewBox="0 0 18 18" ${HIDDEN}><path d="${MOON_PATH}" fill="currentColor"/></svg>`,
  github: `<svg class="site-gh" viewBox="0 0 16 16" ${HIDDEN}><path d="${GITHUB_PATH}"/></svg>`,
  star: `<svg class="site-gh-star" viewBox="0 0 16 16" ${HIDDEN}><path d="${STAR_PATH}" fill="currentColor"/></svg>`,
} as const;
