import { Logo } from '@teamtrail/scout-avatar';

/**
 * The Teamtrail logo mark, for square spaces (never beside the wordmark): six block cursors around an open centre,
 * on transparency, the same colours in the day and night themes.
 */
export function TeamtrailLogo({ size = 40, className }: { size?: number; className?: string }) {
  return <Logo size={size} className={className} />;
}
