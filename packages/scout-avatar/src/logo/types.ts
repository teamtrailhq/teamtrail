/**
 * The background the logo sits on: `light`, `dark` and `blaze` draw fixed colours; `auto` follows the page's colour
 * scheme between `light` and `dark`.
 */
export type LogoTheme = 'light' | 'dark' | 'blaze' | 'auto';

/** One version's colours: the square tile, the t and its path, and the destination dot. */
export interface LogoColors {
  tile: string;
  mark: string;
  dot: string;
}
