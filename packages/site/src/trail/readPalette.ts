import { type Palette } from './types';

/**
 * The field's colours, from the package's tokens (tokens.css), at `strength`: by default half of a page trail's
 * `--trail-alpha`, so the field stays behind it.
 */
export function readPalette(strength?: number): Palette {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string) => root.getPropertyValue(name).trim();
  const main = document.querySelector('svg.trail');
  const trail = main ? parseFloat(getComputedStyle(main).getPropertyValue('--trail-alpha')) : NaN;
  const alpha = strength ?? 0.5 * (Number.isFinite(trail) ? trail : 0.7);
  return {
    line: token('--site-accent'),
    blaze: token('--site-fill'),
    node: token('--site-text-hi'),
    branch: token('--site-faint'),
    bg: token('--site-bg'),
    alpha,
  };
}
