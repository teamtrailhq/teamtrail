import type { TrackerAdapter } from '../adapters/adapter';
import type { AttentionView } from '../model/attention';
import type { ProjectEntry, ProjectsView, ProjectState } from '../model/project';
import { mergeAttention } from './mergeAttention';
import { projectSummary } from './projectSummary';

export interface ProjectsSource {
  configDir?: string;
  homeId: string;
  entries: ProjectEntry[];
  autoRegister: boolean;
  stateOf: (entry: ProjectEntry) => ProjectState;
  /** The tracker to read: the open bridge's when there is one, else the files; undefined when unreadable. */
  adapterOf: (entry: ProjectEntry, state: ProjectState) => Promise<TrackerAdapter | undefined>;
  now?: number;
}

/** Every project's summary and one attention queue ranked across them. A project that fails reads as missing. */
export async function projectsView(src: ProjectsSource): Promise<ProjectsView> {
  const now = src.now ?? Date.now();
  const results = await Promise.all(
    src.entries.map(async (entry) => {
      const home = entry.id === src.homeId;
      const state = src.stateOf(entry);
      try {
        const adapter = state.kind === 'missing' ? undefined : await src.adapterOf(entry, state);
        return await projectSummary({ entry, home, state, adapter, configDir: src.configDir, now });
      } catch (e) {
        const failed = await projectSummary({ entry, home, state: { kind: 'missing' }, now });
        return { summary: { ...failed.summary, state, note: `Could not read: ${(e as Error).message}` } };
      }
    }),
  );
  const queues = results.flatMap((r) =>
    r.view ? [{ projectId: r.summary.id, project: r.summary.name, view: r.view as AttentionView }] : [],
  );
  return {
    home: src.homeId,
    projects: results.map((r) => r.summary),
    attention: mergeAttention(queues),
    autoRegister: src.autoRegister,
  };
}
