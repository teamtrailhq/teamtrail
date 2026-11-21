import { BRAND } from '@teamtrail/core';
import { Logo } from '@teamtrail/scout-avatar';
import type { ElementType } from 'react';

/**
 * The `teamtrail` wordmark: the logo mark followed by the name in lowercase in Inter 600. The mark keeps its own
 * colours; the name's ink follows the theme (styles/mark-and-voices.css), and `className` sets the size. Use it wherever
 * the brand shows in a space wider than tall; square spaces take the mark alone. Running text says "Teamtrail".
 */
export function Wordmark({ as: Tag = 'span', className }: { as?: ElementType; className?: string }) {
  return (
    <Tag className={className ? `tt-wordmark ${className}` : 'tt-wordmark'} role="img" aria-label={BRAND.name}>
      <Logo className="tt-wordmark-mark" />
      <span className="tt-wordmark-name">{BRAND.name.toLowerCase()}</span>
    </Tag>
  );
}
