import { HttpClient, linear, TrackerError, type HttpOptions } from '../http';
import type { LinearProjectOption } from '../types';
import { linearGql } from './linearGql';

/** Projects read before stopping. */
const PROJECT_CAP = 200;
const PER_PAGE = 50;

interface ProjectsPage {
  team: {
    projects: {
      nodes: { id: string; name: string; state?: string | null }[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

const PROJECTS_QUERY = `query TeamProjects($id: String!, $first: Int!, $after: String) {
  team(id: $id) {
    projects(first: $first, after: $after, orderBy: updatedAt) {
      nodes { id name state }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

/** The projects of one team, most recently updated first, at most `cap`. Throws a `TrackerError` when Linear refuses. */
export async function listLinearProjects(
  o: { apiKey: string; teamId: string; apiUrl?: string; cap?: number } & HttpOptions,
): Promise<{ projects: LinearProjectOption[]; truncated: boolean }> {
  const cap = o.cap ?? PROJECT_CAP;
  const gql = linearGql(new HttpClient(linear, { retries: 1, ...o }), o.apiKey.trim(), o.apiUrl);
  const projects: LinearProjectOption[] = [];
  let after: string | null = null;
  let more = true;
  while (more && projects.length < cap) {
    const vars = { id: o.teamId, first: Math.min(PER_PAGE, cap - projects.length), after };
    const page: ProjectsPage = await gql<ProjectsPage>(PROJECTS_QUERY, vars);
    if (!page.team) throw new TrackerError('not_found', `Linear: team ${o.teamId} not found`);
    const { nodes, pageInfo } = page.team.projects;
    projects.push(...nodes.map((p) => ({ id: p.id, name: p.name, state: p.state ?? undefined })));
    more = pageInfo.hasNextPage;
    after = pageInfo.endCursor;
  }
  return { projects: projects.slice(0, cap), truncated: more };
}
