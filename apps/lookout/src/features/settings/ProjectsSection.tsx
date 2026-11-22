import { BRAND, type ProjectSummary } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine, Row } from '../../components/ui';
import { AddProject, projectsApi, useProjects } from '../projects';
import { SectionIntro } from './SectionIntro';
import { SettingsSection } from './SettingsSection';

const contextOf = (p: ProjectSummary) => [
  p.home && { text: 'This Lookout', strong: true },
  p.state.kind === 'missing' && 'Missing',
  { text: p.path, code: true },
];

/** The repos this Lookout supervises: add, remove, and whether agents add their repo on their own. */
export function ProjectsSection() {
  const { view, reload } = useProjects();
  const [error, setError] = useState<string>();
  if (!view) return null;
  const run = (p: Promise<unknown>) => {
    setError(undefined);
    p.then(reload, (e: Error) => setError(e.message));
  };
  return (
    <SettingsSection title="Projects">
      <SectionIntro
        lead="Supervise several repos from this Lookout. All projects shows what needs you in each."
        more={[
          'The list lives in your config folder on this machine, never in a repo.',
          'Agents only ever work in their own repo.',
          'A project that shares its decisions offers them to agents in your other projects as suggestions, never as answers.',
        ]}
      />
      <ul className="pj-list set-projects">
        {view.projects.map((p) => (
          <Row
            key={p.id}
            as="li"
            edge={p.state.kind === 'missing' ? 'attention' : 'neutral'}
            title={p.name}
            context={<MetaLine parts={contextOf(p)} />}
            actions={
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  on={p.sharePrecedents}
                  aria-pressed={p.sharePrecedents}
                  className="share-precedents-toggle"
                  title="Offer this project's decisions as suggestions when agents look for precedents in your other projects"
                  onClick={() => run(projectsApi.setShare(p.id, !p.sharePrecedents))}
                >
                  {p.sharePrecedents ? 'Shares decisions' : 'Share decisions'}
                </Button>
                {!p.home && (
                  <Button size="sm" variant="ghost" onClick={() => run(projectsApi.remove(p.id))}>
                    Remove
                  </Button>
                )}
              </>
            }
          />
        ))}
      </ul>
      <AddProject onAdded={reload} />
      <div className="att-settings-row set-field">
        <span className="set-field-label">Agents add their repo when they connect</span>
        <Button
          size="sm"
          on={view.autoRegister}
          aria-pressed={view.autoRegister}
          className="auto-register-toggle"
          onClick={() => run(projectsApi.setAutoRegister(!view.autoRegister))}
        >
          {view.autoRegister ? 'On' : 'Off'}
        </Button>
      </div>
      <MetaLine
        className="set-hint"
        parts={[
          { text: `${BRAND.slug} projects add <path>`, code: true },
          `--no-register or ${BRAND.noRegisterEnv} opts one agent out`,
        ]}
      />
      {error && <span className="vf-err">{error}</span>}
    </SettingsSection>
  );
}
