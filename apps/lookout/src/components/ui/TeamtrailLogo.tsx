import { Logo } from '@teamtrail/scout-avatar';

/**
 * The Teamtrail logo mark, beside the wordmark; `bare` drops the tile, for a small mark inline with text.
 * It follows the Lookout's day and night theme (through `color-scheme`, set in styles/theme.css).
 */
export function TeamtrailLogo({ size = 40, bare, className }: { size?: number; bare?: boolean; className?: string }) {
  return <Logo size={size} bare={bare} theme="auto" className={className} />;
}
