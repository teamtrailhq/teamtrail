import { ARCHIVED_LABEL } from '../../../model/brand';
import type { MapSummary } from '../../../model/types';
import type { LinearGql } from './linearGql';

type Node = { id: string; identifier: string; title: string; labels?: { nodes: { name: string }[] } };
const QUERY = `query Trails($filter: IssueFilter) { issues(first: 100, filter: $filter) { nodes { id identifier title labels { nodes { name } } } } }`;

/** The team's trail issues matching `filter`, as trail summaries; the archived label marks archived ones. */
export async function listLinearTrails(gql: LinearGql, filter: unknown): Promise<MapSummary[]> {
  const d = await gql<{ issues: { nodes: Node[] } }>(QUERY, { filter });
  return d.issues.nodes.map((i) => ({
    id: i.id,
    key: i.identifier,
    title: i.title,
    ...(i.labels?.nodes.some((l) => l.name === ARCHIVED_LABEL) ? { archived: true as const } : {}),
  }));
}
