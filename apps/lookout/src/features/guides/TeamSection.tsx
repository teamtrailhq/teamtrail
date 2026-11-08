import type { MapDoc } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { useGuides } from './useGuides';

/** The trail's team: the guides its tickets use. With Reviewer on the team, review tickets get the reviewer guide. */
export function TeamSection(props: { map: MapDoc }) {
  const { view, act } = useGuides();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const team = props.map.guides ?? [];
  const usable = view.guides.filter((r) => r.status === 'active' && r.guide);
  const toggle = (id: string) => {
    const next = team.includes(id) ? team.filter((x) => x !== id) : [...team, id];
    setError(undefined);
    void act('/guides/team', { mapId: props.map.id, guides: next }).then(setError);
  };
  return (
    <SettingsSection title={`Team of ${props.map.key}`}>
      <p className="vf-intro">
        The guides this trail works with. With Reviewer on the team, review tickets come with the reviewer's
        instructions and checklist.
      </p>
      <div className="team-guides">
        {usable.map((r) => {
          const on = team.includes(r.id);
          return (
            <Button
              key={r.id}
              size="sm"
              on={on}
              aria-pressed={on}
              title={r.guide!.summary}
              onClick={() => toggle(r.id)}
            >
              {r.guide!.name}
            </Button>
          );
        })}
      </div>
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
