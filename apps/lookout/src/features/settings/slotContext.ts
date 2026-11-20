import { createContext } from 'react';
import type { SettingsSectionId, SettingsStorage } from './types';

/** When a section's last change saved, and whether the route journaled it. */
export type SavedMark = { at: number; journaled: boolean };

/**
 * What a Settings section knows from the slot it sits in: which section it is (for its headline), where the setting
 * lives, the last save to show and how to mark one. `nested` is set inside a section, so a sub-section keeps the
 * compact look instead of a card in a card. Outside any slot (the first run), sections keep the compact look too.
 */
export const SlotContext = createContext<{
  id?: SettingsSectionId;
  storage?: SettingsStorage;
  saved?: SavedMark;
  mark: (journaled: boolean) => void;
  nested: boolean;
}>({ mark: () => undefined, nested: false });
