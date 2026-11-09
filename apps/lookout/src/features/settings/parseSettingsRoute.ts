import { SETTINGS_GROUPS } from './settingsGroups';
import type { SettingsRoute } from './types';

/**
 * Reads `?settings=`: null when absent (Settings closed). A group id opens that group, a section id opens its group
 * at that section (`?settings=slack`, `?settings=guides`), and anything else, empty included, opens Settings with no
 * group chosen yet.
 */
export function parseSettingsRoute(value: string | null): SettingsRoute | null {
  if (value === null) return null;
  const group = SETTINGS_GROUPS.find((g) => g.id === value);
  if (group) return { group: group.id };
  const owner = SETTINGS_GROUPS.find((g) => g.sections.some((s) => s.id === value));
  if (!owner) return {};
  const section = owner.sections.find((s) => s.id === value);
  return { group: owner.id, section: section?.id };
}
