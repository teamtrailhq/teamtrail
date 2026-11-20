import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { type SavedMark, SlotContext } from './slotContext';
import type { SettingsSectionId, SettingsStorage } from './types';

/**
 * One section on a Settings group page, with an anchor for deep links. It tells the section inside which one it is
 * and where its setting lives, both shown on the section card's label line, and keeps the section's last save.
 */
export function SettingsSlot(props: { id: SettingsSectionId; storage?: SettingsStorage; children: ReactNode }) {
  const [saved, setSaved] = useState<SavedMark>();
  const mark = useCallback((journaled: boolean) => setSaved({ at: Date.now(), journaled }), []);
  const value = useMemo(
    () => ({ id: props.id, storage: props.storage, saved, mark, nested: false }),
    [props.id, props.storage, saved, mark],
  );
  return (
    <div className="sp-slot" id={`settings-${props.id}`}>
      <SlotContext.Provider value={value}>{props.children}</SlotContext.Provider>
    </div>
  );
}
