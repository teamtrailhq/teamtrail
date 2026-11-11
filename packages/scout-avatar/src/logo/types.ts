/** The background the logo sits on: `light` and `dark` draw fixed colours; `auto` follows the page's colour scheme. */
export type LogoTheme = 'light' | 'dark' | 'auto';

/** One version's colours: the tile and its edge, the T and its path, and the destination dot. */
export interface LogoColors {
  tile: string;
  edge: string;
  mark: string;
  dot: string;
}
