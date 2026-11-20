import { type ReactNode, useContext } from 'react';
import { Label, LabelLine, SceneCard } from '../../components/ui';
import { sectionHeadline } from './sectionHeadline';
import { SectionSaved } from './SectionSaved';
import { SlotContext } from './slotContext';
import type { SettingsStorage } from './types';

const WHERE: Record<SettingsStorage, string> = {
  repo: 'Committed to repo',
  machine: 'This machine only',
  browser: 'This browser only',
};

/**
 * A Settings section. In a Settings slot it is a card: a label line (the section, where it lives, and the last
 * save), the headline saying what it decides, then the section itself. Inside another section, or outside Settings
 * (the first run), it keeps the compact look: a label over its content.
 */
export function SettingsSection(props: { title: string; children: ReactNode }) {
  const slot = useContext(SlotContext);
  if (!slot.id || slot.nested) {
    return (
      <section className="set-sec set-sub">
        <Label as="h4">{props.title}</Label>
        {props.children}
      </section>
    );
  }
  const label = (
    <span className="set-sec-bar">
      <LabelLine parts={[props.title, slot.storage && WHERE[slot.storage]]} />
      {slot.saved && <SectionSaved key={slot.saved.at} saved={slot.saved} />}
    </span>
  );
  return (
    <SlotContext.Provider value={{ ...slot, nested: true }}>
      <SceneCard className="set-sec set-card" label={label} headline={sectionHeadline(slot.id)}>
        <div className="set-card-body">{props.children}</div>
      </SceneCard>
    </SlotContext.Provider>
  );
}
