import { LOGO_COLORS } from './logoColors';
import { logoShapes } from './logoShapes';

/** A standalone SVG favicon: the bare mark, light version on light browser tabs and dark version on dark ones. */
export function logoFaviconSvg() {
  const { light, dark } = LOGO_COLORS;
  const style = [
    `.m{fill:${light.mark}}.d{fill:${light.dot}}`,
    `@media (prefers-color-scheme:dark){.m{fill:${dark.mark}}.d{fill:${dark.dot}}}`,
  ].join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
    `<style>${style}</style>`,
    '<g transform="translate(4 2) scale(.94)">',
    logoShapes({ mark: 'class="m"', dot: 'class="d"' }),
    '</g></svg>',
  ].join('');
}
