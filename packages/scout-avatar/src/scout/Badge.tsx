import { useMemo } from 'react';
import { type BadgeFace, type BadgeShape, badgeMarkup } from './badgeArt';
import { STYLES } from './frames';
import type { ScoutStyleId } from './types';

/** Scout's avatar at any size: a circle by default. Sizes under 40px use the simple drawing. */
export function Badge({
  face = { eyes: 'open', mouth: 'rest' },
  variant = 'crt',
  size,
  simple,
  shape = 'circle',
  className,
}: {
  face?: BadgeFace;
  variant?: ScoutStyleId;
  size: number;
  simple?: boolean;
  shape?: BadgeShape;
  className?: string;
}) {
  const { eyes, mouth, light } = face;
  const html = useMemo(
    () => badgeMarkup({ eyes, mouth, light }, { lamp: STYLES[variant].lamp, simple: simple ?? size < 40, shape }),
    [eyes, mouth, light, variant, simple, size, shape],
  );
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
