import type { CSSProperties } from 'react';
import { LOGO_COLORS } from './logoColors';

/**
 * The `--tt-logo-*` colours for `theme="auto"`: each is `light-dark()`, so it follows the page's `color-scheme`
 * (the Lookout and the site set it per theme), with no script and no flash.
 */
export function logoAutoStyle(): CSSProperties {
  const { light, dark } = LOGO_COLORS;
  const pick = (key: keyof typeof light) => `light-dark(${light[key]}, ${dark[key]})`;
  return {
    ['--tt-logo-tile' as string]: pick('tile'),
    ['--tt-logo-edge' as string]: pick('edge'),
    ['--tt-logo-mark' as string]: pick('mark'),
    ['--tt-logo-dot' as string]: pick('dot'),
  };
}
