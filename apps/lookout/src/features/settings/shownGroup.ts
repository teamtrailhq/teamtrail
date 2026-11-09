import type { Breakpoint } from '../../hooks';
import { SETTINGS_GROUPS } from './settingsGroups';
import type { SettingsGroup, SettingsRoute } from './types';

/**
 * The group the Settings page shows for a route: the one asked for, else the first on a wide or laptop screen. A
 * phone with no group chosen shows the list of groups instead (undefined).
 */
export function shownGroup(route: SettingsRoute, bp: Breakpoint): SettingsGroup | undefined {
  if (route.group) return SETTINGS_GROUPS.find((g) => g.id === route.group);
  return bp === 'mobile' ? undefined : SETTINGS_GROUPS[0];
}
