import { ARCHIVED_LABEL } from '../../../model/brand';
import type { MapSummary } from '../../../model/types';
import type { LinearGql } from './linearGql';

type Node = { id: string; identifier: string; title: string; labels?: { nodes: { name: string }[] } };
type Page = { issues: { nodes: Node[]; pageInfo?: { hasNextPage: boolean; endCursor: string | null } } };
const QUERY = `query Trails($filter: IssueFilter, $after: String) { issues(first: 100, after: $after, filter: $filter) {
  nodes { id identifier title labels { nodes { name } } } pageInfo { hasNextPage endCursor } } }`;
/** More trails than this in one team are not listed (a thousand). */
const MAX_PAGES = 10;

/** The team's trail issues matching `filter`, as trail summaries; the archived label marks archived ones. */
export async function listLinearTrails(gql: LinearGql, filter: unknown): Promise<MapSummary[]> {
  const all: Node[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await gql<Page>(QUERY, after ? { filter, after } : { filter });
    all.push(...d.issues.nodes);
    const info = d.issues.pageInfo;
    if (!info?.hasNextPage || !info.endCursor) break;
    after = info.endCursor;
  }
  return all.map((i) => ({
    id: i.id,
    key: i.identifier,
    title: i.title,
    ...(i.labels?.nodes.some((l) => l.name === ARCHIVED_LABEL) ? { archived: true as const } : {}),
  }));
}
