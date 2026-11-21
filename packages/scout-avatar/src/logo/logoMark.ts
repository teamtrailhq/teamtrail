import { LOGO_COLORS } from './logoColors';
import { LOGO_IN_CIRCLE } from './logoInCircle';
import { LOGO_ON_TILE } from './logoOnTile';
import { logoShapes } from './logoShapes';

/**
 * The Teamtrail logo in a 200×200 box: six block cursors around an open centre, on transparency, filling the box.
 * `round` places it smaller, for avatars cropped to a circle; `tile` puts it on the near-black square, for the rare
 * place that must be opaque (an app icon).
 */
export function logoMarkup({ round = false, tile = false }: { round?: boolean; tile?: boolean } = {}) {
  if (!round && !tile) return logoShapes();
  return [
    tile ? `<rect width="200" height="200" fill="${LOGO_COLORS.tile}"/>` : '',
    `<g transform="${round ? LOGO_IN_CIRCLE : LOGO_ON_TILE}">`,
    logoShapes(),
    '</g>',
  ].join('');
}
