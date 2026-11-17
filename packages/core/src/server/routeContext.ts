import type { TrackerAdapter } from '../adapters/adapter';
import type { RepoFiles } from '../model/checkScreening';

/** What a bridge route handler needs: the tracker folder, and the adapter the project is connected to now. */
export interface RouteContext {
  root: string;
  active: () => Promise<TrackerAdapter>;
  /** The repo's files, read-only, for screening check commands; undefined when there's no checkout to read. */
  repoFiles?: () => RepoFiles | undefined;
}
