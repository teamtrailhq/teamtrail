import { HttpClient, linear, type HttpOptions } from '../http';
import type { LinearTeamOption } from '../types';
import { linearGql } from './linearGql';

/** Teams read before stopping. */
const TEAM_CAP = 250;
const PER_PAGE = 50;

interface TeamNode {
  id: string;
  key: string;
  name: string;
  issues?: { nodes: { updatedAt: string }[] };
}

interface TeamsPage {
  teams: { nodes: TeamNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}

const TEAMS_QUERY = `query Teams($first: Int!, $after: String) {
  teams(first: $first, after: $after) {
    nodes { id key name issues(first: 1, orderBy: updatedAt) { nodes { updatedAt } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

/**
 * The teams a key can access, most recently active first, each with its latest issue update. Follows cursor pages
 * and reads at most `cap` teams. Throws a `TrackerError` when Linear refuses.
 */
export async function listLinearTeams(
  o: { apiKey: string; apiUrl?: string; cap?: number } & HttpOptions,
): Promise<{ teams: LinearTeamOption[]; truncated: boolean }> {
  const cap = o.cap ?? TEAM_CAP;
  const gql = linearGql(new HttpClient(linear, { retries: 1, ...o }), o.apiKey.trim(), o.apiUrl);
  const seen: TeamNode[] = [];
  let after: string | null = null;
  let more = true;
  while (more && seen.length < cap) {
    const page: TeamsPage = await gql<TeamsPage>(TEAMS_QUERY, { first: Math.min(PER_PAGE, cap - seen.length), after });
    seen.push(...page.teams.nodes);
    more = page.teams.pageInfo.hasNextPage;
    after = page.teams.pageInfo.endCursor;
  }
  const teams = seen.slice(0, cap).map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    activeAt: t.issues?.nodes[0]?.updatedAt,
  }));
  teams.sort((a, b) => (b.activeAt ?? '').localeCompare(a.activeAt ?? ''));
  return { teams, truncated: more };
}
