import { LOGO_COLORS } from './logoColors';
import { logoShapes } from './logoShapes';
import type { LogoColors, LogoTheme } from './types';

/**
 * The colours as SVG paint. `auto` reads `--tt-logo-tile`, `--tt-logo-edge`, `--tt-logo-mark` and `--tt-logo-dot`
 * (set by `Logo`, or by the page), falling back to the dark version.
 */
function paint(theme: LogoTheme): LogoColors {
  if (theme !== 'auto') return LOGO_COLORS[theme];
  const dark = LOGO_COLORS.dark;
  return {
    tile: `var(--tt-logo-tile, ${dark.tile})`,
    edge: `var(--tt-logo-edge, ${dark.edge})`,
    mark: `var(--tt-logo-mark, ${dark.mark})`,
    dot: `var(--tt-logo-dot, ${dark.dot})`,
  };
}

/**
 * The Teamtrail logo in a 200×200 box: a lowercase t whose stem curves into a path that runs to its destination,
 * on a tile. `dark` (the default) is for dark backgrounds, `light` for light ones.
 */
export function logoMarkup(theme: LogoTheme = 'dark') {
  const c = paint(theme);
  return [
    `<rect x="1" y="1" width="198" height="198" rx="44" fill="${c.tile}" stroke="${c.edge}" stroke-width="2"/>`,
    '<g transform="translate(32 30) scale(.66)">',
    logoShapes({ mark: `fill="${c.mark}"`, dot: `fill="${c.dot}"` }),
    '</g>',
  ].join('');
}

/** The mark with no tile, on transparency, for favicons and small inline use; scaled so the dot stays in the box. */
export function logoBareMarkup(theme: LogoTheme = 'dark') {
  const c = paint(theme);
  return [
    '<g transform="translate(4 2) scale(.94)">',
    logoShapes({ mark: `fill="${c.mark}"`, dot: `fill="${c.dot}"` }),
    '</g>',
  ].join('');
}
