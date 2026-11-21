import { useMemo } from 'react';
import { logoMarkup } from './logoMark';

/**
 * The Teamtrail logo: six block cursors around an open centre, on transparency, the same colours on light and dark
 * pages. `round` sizes it for an avatar shown in a circle; `tile` puts it on the near-black square, for places that
 * must be opaque.
 */
export function Logo({
  size = 40,
  round,
  tile,
  className,
}: {
  size?: number;
  round?: boolean;
  tile?: boolean;
  className?: string;
}) {
  const html = useMemo(() => logoMarkup({ round, tile }), [round, tile]);
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
