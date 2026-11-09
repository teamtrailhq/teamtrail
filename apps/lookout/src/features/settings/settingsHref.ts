import type { SettingsRoute } from './types';

/**
 * The URL for a Settings route, keeping every other query parameter: `?settings=<section>` for a deep link,
 * `?settings=<group>` for a group, a bare `?settings=` for the page with no group chosen, and no parameter when closed.
 */
export function settingsHref(href: string, route: SettingsRoute | null): string {
  const url = new URL(href);
  url.searchParams.delete('settings');
  if (route) url.searchParams.set('settings', route.section ?? route.group ?? '');
  return url.toString();
}
