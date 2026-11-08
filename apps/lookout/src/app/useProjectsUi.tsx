import { useState } from 'react';
import { ProjectsOverview, useProjects } from '../features/projects';
import type { Breakpoint } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';

/** Projects for the app: the summaries, and All projects (`?projects` opens it), which covers the zones. */
export function useProjectsUi(
  bp: Breakpoint,
  nav: ReturnType<typeof useAppNavigation>,
  /** Opens a queue item of the project on screen, as its inbox row would. */
  openHere: (itemId: string) => void,
) {
  const projects = useProjects();
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).has('projects'));
  const overview = open && projects.many && (
    <ProjectsOverview projects={projects} bp={bp} onClose={() => setOpen(false)} onItemHere={openHere} />
  );
  return {
    projects,
    overview,
    openOverview: () => {
      nav.setDecisionsView(null);
      nav.setStatsOpen(false);
      setOpen(true);
    },
  };
}
