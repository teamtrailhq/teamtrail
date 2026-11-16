import { ALL_TICKET_TYPES, trailGuidesByType, type GuidesByType, type MapDoc, type TicketType } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { TypeGuidesRow } from './TypeGuidesRow';
import { useGuides } from './useGuides';

/** Where the trail's guides by type come from, when it isn't its own mapping. */
const SOURCE_TEXT = { defaults: 'Defaults', team: "Defaults, kept within the trail's earlier team" } as const;

/**
 * Settings → This trail → Guides by type: the guides each ticket type takes on, one row per type, every approved
 * guide (your own included) a toggle. A trail starts on the defaults; the first change makes the mapping its own,
 * and Back to defaults returns to them.
 */
export function TrailGuidesSection(props: { map: MapDoc }) {
  const { view, act } = useGuides();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const { byType, source } = trailGuidesByType(props.map);
  const usable = view.guides.filter((r) => r.status === 'active' && r.guide);
  const save = (next: GuidesByType | null) => {
    setError(undefined);
    void act('/guides/trail', { mapId: props.map.id, byType: next }).then(setError);
  };
  const toggle = (type: TicketType, id: string) => {
    const ids = byType[type] ?? [];
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    save({ ...byType, [type]: next });
  };
  return (
    <SettingsSection title="Guides by type">
      <div className="type-guides-head">
        {source === 'trail' ? (
          <Button size="sm" variant="ghost" onClick={() => save(null)}>
            Back to defaults
          </Button>
        ) : (
          <MetaLine parts={[SOURCE_TEXT[source], source === 'team' && props.map.guides?.join(', ')]} />
        )}
      </div>
      <div className="type-guides">
        {ALL_TICKET_TYPES.map((type) => (
          <TypeGuidesRow
            key={type}
            type={type}
            ids={byType[type] ?? []}
            usable={usable}
            onToggle={(id) => toggle(type, id)}
          />
        ))}
      </div>
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
