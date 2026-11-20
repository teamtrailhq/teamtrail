import { LOGO_COLORS } from './logoColors';
import { LOGO_ON_TILE } from './logoOnTile';
import { logoShapes } from './logoShapes';
import type { LogoColors, LogoTheme } from './types';

/**
 * The colours as SVG paint. `auto` reads `--tt-logo-tile`, `--tt-logo-mark` and `--tt-logo-cursor` (set by `Logo`, or by
 * the page), falling back to the dark version.
 */
function paint(theme: LogoTheme): LogoColors {
  if (theme !== 'auto') return LOGO_COLORS[theme];
  const dark = LOGO_COLORS.dark;
  return {
    tile: `var(--tt-logo-tile, ${dark.tile})`,
    mark: `var(--tt-logo-mark, ${dark.mark})`,
    cursor: `var(--tt-logo-cursor, ${dark.cursor})`,
  };
}

/**
 * The Teamtrail logo in a 200×200 box: a lowercase t whose stem curves into a path that runs to a block cursor,
 * on a square tile with no edge. `dark` (the default) is for dark backgrounds, `light` for light ones, `blaze` for
 * the favicon and app icons.
 */
export function logoMarkup(theme: LogoTheme = 'dark') {
  const c = paint(theme);
  return [
    `<rect width="200" height="200" fill="${c.tile}"/>`,
    `<g transform="${LOGO_ON_TILE}">`,
    logoShapes({ mark: `fill="${c.mark}"`, cursor: `fill="${c.cursor}"` }),
    '</g>',
  ].join('');
}

/** The mark with no tile, on transparency, for small inline use: centred in the box, the cursor included. */
export function logoBareMarkup(theme: LogoTheme = 'dark') {
  const c = paint(theme);
  return [
    '<g transform="translate(-3 4) scale(.98)">',
    logoShapes({ mark: `fill="${c.mark}"`, cursor: `fill="${c.cursor}"` }),
    '</g>',
  ].join('');
}
