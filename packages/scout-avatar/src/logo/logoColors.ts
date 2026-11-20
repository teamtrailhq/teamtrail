import type { LogoColors } from './types';

/**
 * The logo's versions: `dark` for dark backgrounds (near-black tile, white t), `light` for light ones (white tile,
 * near-black t), and `blaze`, the favicon and app icon (blaze tile, near-black t, white dot). The dot is blaze on both.
 */
export const LOGO_COLORS: Record<'light' | 'dark' | 'blaze', LogoColors> = {
  light: { tile: '#FFFFFF', mark: '#0E0F11', dot: '#FF6B2C' },
  dark: { tile: '#0A0A0B', mark: '#F4F4F6', dot: '#FF6B2C' },
  blaze: { tile: '#FF6B2C', mark: '#0A0A0B', dot: '#FFFFFF' },
};
