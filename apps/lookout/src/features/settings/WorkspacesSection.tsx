import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine } from '../../components/ui';
import { useWorkspaces, WorkspaceList } from '../workspaces';
import { SectionIntro } from './SectionIntro';
import { SettingsSection } from './SettingsSection';

/** Parallel work: a separate git worktree and branch for each claimed ticket. Teamtrail never merges or pushes. */
export function WorkspacesSection() {
  const { view, save, remove } = useWorkspaces();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const on = view.settings.worktrees;
  const toggle = () => {
    setError(undefined);
    save({ ...view.settings, worktrees: !on }).then(setError, (e: Error) => setError(e.message));
  };
  return (
    <SettingsSection title="Workspaces">
      <SectionIntro
        lead="Give each claimed ticket its own worktree and branch, so agents working at once don't collide."
        points={[`You review and merge the branches; ${BRAND.name} never merges or pushes.`]}
      />
      <div className="att-settings-row set-field">
        <span className="set-field-label">A worktree per ticket</span>
        <Button size="sm" on={on} aria-pressed={on} className="worktrees-toggle" onClick={toggle}>
          {on ? 'On' : 'Off'}
        </Button>
      </div>
      <MetaLine
        className="set-hint"
        parts={[
          { text: `${BRAND.dataDir}/workspaces.json`, code: true },
          count(view.workspaces.filter((w) => w.active).length, 'active'),
          count(view.workspaces.filter((w) => !w.active).length, 'finished'),
        ]}
      />
      <WorkspaceList rows={view.workspaces} onRemove={remove} />
      {view.errors.length > 0 && (
        <ul className="vf-errors">
          {view.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}

const count = (n: number, what: string) => `${n} ${what}`;
