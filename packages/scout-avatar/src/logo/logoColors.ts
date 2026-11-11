import type { LogoColors } from './types';

/** The logo's two versions: `light` for light backgrounds (pale tile, deep moss), `dark` for dark ones (dark tile, light moss). */
export const LOGO_COLORS: Record<'light' | 'dark', LogoColors> = {
  light: { tile: '#e9f1e6', edge: '#d3e2cd', mark: '#4f8a48', dot: '#e07a2f' },
  dark: { tile: '#17211c', edge: '#2a3a31', mark: '#8fbf84', dot: '#e8833a' },
};
