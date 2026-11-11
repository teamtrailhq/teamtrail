import { useMemo } from 'react';
import { logoAutoStyle } from './logoAutoStyle';
import { logoBareMarkup, logoMarkup } from './logoMark';
import type { LogoTheme } from './types';

/**
 * The Teamtrail logo mark; `bare` drops the tile, for favicons and inline use. `theme` picks the version for the
 * background: `dark` (the default), `light`, or `auto`, which follows the page's `color-scheme`.
 */
export function Logo({
  size = 40,
  bare,
  theme = 'dark',
  className,
}: {
  size?: number;
  bare?: boolean;
  theme?: LogoTheme;
  className?: string;
}) {
  const html = useMemo(() => (bare ? logoBareMarkup(theme) : logoMarkup(theme)), [bare, theme]);
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
