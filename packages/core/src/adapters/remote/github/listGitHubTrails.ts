import { ARCHIVED_LABEL, MAP_LABEL } from '../../../model/brand';
import type { MapSummary } from '../../../model/types';
import type { GitHubClient } from './githubClient';
import { labelNames, type RestIssue } from './schema';

const PAGE = 100;
/** More trails than this in one repo are not listed (a thousand). */
const MAX_PAGES = 10;

/** The repository's trail issues, open and closed, as trail summaries; the archived label marks archived ones. */
export async function listGitHubTrails(gh: GitHubClient): Promise<MapSummary[]> {
  const all: RestIssue[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const more = page > 1 ? `&page=${page}` : '';
    const path = `/issues?labels=${encodeURIComponent(MAP_LABEL)}&state=all&per_page=${PAGE}${more}`;
    const r = await gh.repo<RestIssue[]>('GET', path);
    all.push(...r.body);
    if (r.body.length < PAGE) break;
  }
  return all
    .filter((i) => !i.pull_request)
    .map((i) => ({
      id: String(i.number),
      key: `#${i.number}`,
      title: i.title,
      ...(labelNames(i.labels).includes(ARCHIVED_LABEL) ? { archived: true as const } : {}),
    }));
}
