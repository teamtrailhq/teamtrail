import { useMemo } from 'react';
import { logoBareMarkup, logoMarkup } from './logoMark';

/** The Teamtrail logo mark; `bare` drops the tile, for favicons. */
export function Logo({ size = 40, bare, className }: { size?: number; bare?: boolean; className?: string }) {
  const html = useMemo(() => (bare ? logoBareMarkup() : logoMarkup()), [bare]);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Teamtrail"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
