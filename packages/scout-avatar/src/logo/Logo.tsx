import { useMemo } from 'react';
import { logoAutoStyle } from './logoAutoStyle';
import { logoBareMarkup, logoMarkup } from './logoMark';
import type { LogoTheme } from './types';

/**
 * The Teamtrail logo mark; `bare` drops the tile, for favicons and inline use; `round` sizes the mark for a tile
 * shown in a circle. `theme` picks the version for the
 * background: `dark` (the default), `light`, `blaze` (the app icon), or `auto`, which follows the page's `color-scheme`.
 */
export function Logo({
  size = 40,
  bare,
  round,
  theme = 'dark',
  className,
}: {
  size?: number;
  bare?: boolean;
  round?: boolean;
  theme?: LogoTheme;
  className?: string;
}) {
  const html = useMemo(() => (bare ? logoBareMarkup(theme) : logoMarkup(theme, { round })), [bare, round, theme]);
  const style = useMemo(() => (theme === 'auto' ? logoAutoStyle() : undefined), [theme]);
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Teamtrail"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
