import { BRAND } from '@teamtrail/core';
import type { ElementType } from 'react';

/**
 * The `teamtrail.` wordmark: the name in lowercase in the display face, ending at the trail's destination, an orange
 * dot. Its ink and dot follow the theme (styles/mark-and-voices.css); `className` sets the size. Use it wherever the
 * brand shows in a space wider than tall; square spaces take the logo tile or mark instead, never both side by side.
 */
export function Wordmark({ as: Tag = 'span', className }: { as?: ElementType; className?: string }) {
  return (
    <Tag className={className ? `tt-wordmark ${className}` : 'tt-wordmark'} role="img" aria-label={BRAND.name}>
      {BRAND.name.toLowerCase()}
      <span className="tt-wordmark-dot" aria-hidden="true" />
    </Tag>
  );
}
