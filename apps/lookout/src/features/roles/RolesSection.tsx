import { BRAND } from '@teamtrail/core';
import { useEffect, useRef, useState } from 'react';
import { Button, MetaLine } from '../../components/ui';
import { SettingsSection } from '../settings/SettingsSection';
import { CatalogDialog } from './CatalogDialog';
import { RoleRow } from './RoleRow';
import { useRoles } from './useRoles';

/**
 * Settings → Roles: every role the project has (built in, hand-written, from a catalog), its status against the
 * lockfile, the checks it proposes, and the trail lead's actions. `focus` scrolls here (from the attention queue).
 */
export function RolesSection(props: { focus?: boolean }) {
  const { view, act } = useRoles();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.focus && view) ref.current?.scrollIntoView({ block: 'start' });
  }, [props.focus, !!view]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view) return null;
  const run = async (path: string, body: Record<string, string>) => {
    setBusy(true);
    setError(await act(path, body));
    setBusy(false);
  };
  return (
    <div className="roles-section" ref={ref}>
      <SettingsSection title="Roles">
        <p className="vf-intro">
          Roles give an agent instructions and a checklist for the tickets that ask for them. A role can add checks,
          never remove them, and its commands only run once you approve them.
        </p>
        <ul className="roles-list">
          {view.roles.map((r) => (
            <RoleRow key={r.id} r={r} busy={busy} onAct={(path, body) => void run(path, body)} />
          ))}
        </ul>
        <div className="roles-foot">
          <Button size="sm" onClick={() => setBrowsing(true)}>
            Browse catalog
          </Button>
          <MetaLine
            parts={[
              { text: `${BRAND.dataDir}/roles/`, code: true },
              { text: 'roles.lock.json', code: true },
            ]}
          />
        </div>
        {view.configErrors.length > 0 && (
          <ul className="vf-errors">
            {view.configErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {error && <span className="vf-err">{error}</span>}
      </SettingsSection>
      {browsing && <CatalogDialog registries={view.registries} onClose={() => setBrowsing(false)} />}
    </div>
  );
}
