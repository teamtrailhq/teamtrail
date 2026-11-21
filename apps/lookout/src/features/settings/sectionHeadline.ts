import { SETTINGS_GROUPS } from './settingsGroups';
import type { SettingsSectionId } from './types';

/** What a section decides, as its card's headline. */
export function sectionHeadline(id: SettingsSectionId): string | undefined {
  for (const g of SETTINGS_GROUPS) {
    const s = g.sections.find((x) => x.id === id);
    if (s) return s.decides;
  }
  return undefined;
}
