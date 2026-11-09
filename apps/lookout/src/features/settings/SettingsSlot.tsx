import type { ReactNode } from 'react';
import { MetaLine } from '../../components/ui';
import type { SettingsSectionId, SettingsStorage } from './types';

const WHERE: Record<SettingsStorage, string> = {
  repo: 'Committed to the repo',
  machine: 'Only on this machine',
  browser: 'Only in this browser',
};

/**
 * One section on a Settings group page, unchanged, with an anchor for deep links and, where it matters, a quiet
 * note on where the setting lives. The note hides while the section has nothing to show (still loading).
 */
export function SettingsSlot(props: { id: SettingsSectionId; storage?: SettingsStorage; children: ReactNode }) {
  const note = props.storage && WHERE[props.storage];
  return (
    <div className="sp-slot" id={`settings-${props.id}`}>
      {props.children}
      {note && <MetaLine className="sp-where" parts={[note]} />}
    </div>
  );
}
