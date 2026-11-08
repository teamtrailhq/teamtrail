import { Button, SectionHeader } from '../../components/ui';
import { useNow } from '../../hooks';
import { activeProject } from '../../lib/apiBase';
import { ProjectCard } from './ProjectCard';
import { openProject } from './projectText';
import type { ProjectsApi } from './useProjects';

/** The phone home tab's projects list: the other repos, so switching is one tap. Hidden with one project. */
export function PhoneProjects(props: { projects: ProjectsApi; onOverview: () => void }) {
  const now = useNow(15_000);
  const { view } = props.projects;
  if (!view || !props.projects.many) return null;
  const current = activeProject() ?? view.home;
  return (
    <section className="phone-projects">
      <SectionHeader
        title="Projects"
        count={view.projects.length}
        right={
          <Button size="sm" variant="ghost" onClick={props.onOverview}>
            All projects
          </Button>
        }
      />
      <ul className="pj-list">
        {view.projects
          .filter((p) => p.id !== current)
          .map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              current={false}
              now={now}
              onOpen={p.state.kind === 'missing' ? undefined : () => openProject(p, view.home)}
            />
          ))}
      </ul>
    </section>
  );
}
