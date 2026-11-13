import { ARCHIVED_LABEL, MAP_LABEL } from '../../../model/brand';
import type { MapSummary } from '../../../model/types';
import type { GitHubClient } from './githubClient';
import { labelNames, type RestIssue } from './schema';

/** The repository's trail issues, open and closed, as trail summaries; the archived label marks archived ones. */
export async function listGitHubTrails(gh: GitHubClient): Promise<MapSummary[]> {
  const r = await gh.repo<RestIssue[]>('GET', `/issues?labels=${encodeURIComponent(MAP_LABEL)}&state=all&per_page=100`);
  return r.body
    .filter((i) => !i.pull_request)
    .map((i) => ({
      id: String(i.number),
      key: `#${i.number}`,
      title: i.title,
      ...(labelNames(i.labels).includes(ARCHIVED_LABEL) ? { archived: true as const } : {}),
    }));
}
