import { useEffect } from 'react';
import { Label, Panel, SectionHeader } from '../../components/ui';
import { type Breakpoint, useNow } from '../../hooks';
import { activeProject } from '../../lib/apiBase';
import { AddProject } from './AddProject';
import { AwayBriefing } from './AwayBriefing';
import { MergedAttention } from './MergedAttention';
import { ProjectCard } from './ProjectCard';
import { openProject } from './projectText';
import type { ProjectsApi } from './useProjects';
import { useProjectsBriefing } from './useProjectsBriefing';

/**
 * All projects: one row per registered repo, the queue ranked across them, and what changed while you were
 * away. Covers the zones under the header like the Logbook; opening a project loads it in place.
 */
export function ProjectsOverview(props: {
  projects: ProjectsApi;
  bp: Breakpoint;
  onClose: () => void;
  /** Opens a queue item of the project on screen, without a reload. */
  onItemHere: (itemId: string) => void;
}) {
  const { view, reload } = props.projects;
  const now = useNow(15_000);
  const briefing = useProjectsBriefing();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  if (!view) return null;
  const current = activeProject() ?? view.home;
  const open = (id: string) => {
    const p = view.projects.find((x) => x.id === id);
    if (p?.id === current) props.onClose();
    else if (p) openProject(p, view.home);
  };
  const openItem = (projectId: string, itemId: string) => {
    const p = view.projects.find((x) => x.id === projectId);
    if (!p) return;
    if (p.id !== current) return openProject(p, view.home, itemId);
    props.onClose();
    props.onItemHere(itemId);
  };
  return (
    <Panel className={`zone decisions-view projects-view dv-${props.bp}`}>
      <header className="dv-head">
        <Label as="h2">All projects</Label>
        <span className="dv-head-right">
          <button className="icon-btn" onClick={props.onClose} aria-label="Close">
            ×
          </button>
        </span>
      </header>
      <div className="pj-body">
        <MergedAttention view={view} now={now} onOpen={openItem} onAnswered={reload} />
        <section className="pj-section pj-projects">
          <SectionHeader
            title="Projects"
            count={view.projects.length}
            info="Each repo registered on this machine, read from its own files. Nothing leaves your machine."
          />
          <ul className="pj-list">
            {view.projects.map((p) => (
              <ProjectCard
                key={p.id}
                p={p}
                current={p.id === current}
                now={now}
                onOpen={p.state.kind === 'missing' ? undefined : () => open(p.id)}
              />
            ))}
          </ul>
          <AddProject onAdded={reload} />
        </section>
        <AwayBriefing briefing={briefing} now={now} onOpen={open} />
      </div>
    </Panel>
  );
}
