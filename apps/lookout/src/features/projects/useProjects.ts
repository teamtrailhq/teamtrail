import type { ProjectsView } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { onServerEvent } from '../../lib/trackerChanges';
import { projectsApi } from './projectsApi';

export interface ProjectsApi {
  /** Undefined until loaded, or when the server has no projects routes. */
  view?: ProjectsView;
  /** More than one project: the switcher and All projects show. */
  many: boolean;
  reload: () => void;
}

async function fetchProjects(): Promise<ProjectsView | undefined> {
  const r = await fetch(projectsApi.url);
  return r.ok ? ((await r.json()) as ProjectsView) : undefined;
}

/**
 * Every project's summary and the merged queue (`GET /projects`), live through the `projects` event on the
 * shared `/events` stream; the server sends it only while more than one project is known.
 */
export function useProjects(): ProjectsApi {
  const [view, setView] = useState<ProjectsView>();
  const { reload, pushed } = useLiveLoad({ load: fetchProjects, show: (v) => v && setView(v) });
  // the event carries the view: loads started before it are older
  useEffect(
    () =>
      onServerEvent('projects', (data) => {
        pushed();
        setView(JSON.parse(data) as ProjectsView);
      }),
    [pushed],
  );
  return { view, many: (view?.projects.length ?? 0) > 1, reload };
}
