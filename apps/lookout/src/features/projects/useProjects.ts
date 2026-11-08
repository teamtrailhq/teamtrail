import type { ProjectsView } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { onServerEvent } from '../../lib/trackerChanges';
import { projectsApi } from './projectsApi';

export interface ProjectsApi {
  /** Undefined until loaded, or when the server has no projects routes. */
  view?: ProjectsView;
  /** More than one project: the switcher and All projects show. */
  many: boolean;
  reload: () => void;
}

/**
 * Every project's summary and the merged queue (`GET /projects`), live through the `projects` event on the
 * shared `/events` stream; the server sends it only while more than one project is known.
 */
export function useProjects(): ProjectsApi {
  const [view, setView] = useState<ProjectsView>();
  const reload = useCallback(() => {
    void fetch(projectsApi.url)
      .then((r) => (r.ok ? (r.json() as Promise<ProjectsView>) : undefined))
      .then((v) => v && setView(v))
      .catch(() => {});
  }, []);
  useEffect(() => onServerEvent('projects', (data) => setView(JSON.parse(data) as ProjectsView)), []);
  useEffect(reload, [reload]);
  return { view, many: (view?.projects.length ?? 0) > 1, reload };
}
