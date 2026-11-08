import type { MapDoc } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { useRoles } from './useRoles';

/** The trail's team: the roles its tickets use. With Reviewer on the team, review tickets get the reviewer role. */
export function TeamSection(props: { map: MapDoc }) {
  const { view, act } = useRoles();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const team = props.map.roles ?? [];
  const usable = view.roles.filter((r) => r.status === 'active' && r.role);
  const toggle = (id: string) => {
    const next = team.includes(id) ? team.filter((x) => x !== id) : [...team, id];
    setError(undefined);
    void act('/roles/team', { mapId: props.map.id, roles: next }).then(setError);
  };
  return (
    <SettingsSection title={`Team of ${props.map.key}`}>
      <p className="vf-intro">
        The roles this trail works with. With Reviewer on the team, review tickets come with the reviewer's instructions
        and checklist.
      </p>
      <div className="team-roles">
        {usable.map((r) => {
          const on = team.includes(r.id);
          return (
            <Button key={r.id} size="sm" on={on} aria-pressed={on} title={r.role!.summary} onClick={() => toggle(r.id)}>
              {r.role!.name}
            </Button>
          );
        })}
      </div>
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
