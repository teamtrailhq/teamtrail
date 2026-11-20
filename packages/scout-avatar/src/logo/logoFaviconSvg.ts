import { LOGO_COLORS } from './logoColors';
import { LOGO_ON_TILE } from './logoOnTile';
import { logoShapes } from './logoShapes';

/** A standalone SVG favicon: the blaze tile, the same on light and dark browser tabs. */
export function logoFaviconSvg() {
  const { tile, mark, dot } = LOGO_COLORS.blaze;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
    `<rect width="200" height="200" fill="${tile}"/>`,
    `<g transform="${LOGO_ON_TILE}">`,
    logoShapes({ mark: `fill="${mark}"`, dot: `fill="${dot}"` }),
    '</g></svg>',
  ].join('');
}
