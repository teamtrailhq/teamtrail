import type { TrackerAdapter } from '../adapters/adapter';
import type { RepoFiles } from '../model/checkScreening';
import type { ReadinessHost } from '../model/readiness';

/** What a bridge route handler needs: the tracker folder, and the adapter the project is connected to now. */
export interface RouteContext {
  root: string;
  active: () => Promise<TrackerAdapter>;
  /** The repo's files, read-only, for screening check commands; undefined when there's no checkout to read. */
  repoFiles?: () => RepoFiles | undefined;
  /** Where repo readiness is read and probed (readiness/readinessHost.ts); default this machine's checkout. */
  readiness?: ReadinessHost;
}
