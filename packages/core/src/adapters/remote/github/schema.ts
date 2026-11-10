import { BRAND } from '../../../model/brand';

export const DEFAULT_API = 'https://api.github.com';

export interface RestIssue {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  state_reason?: string | null;
  labels: ({ name: string } | string)[];
  assignees?: { login: string }[];
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  pull_request?: unknown;
}

/** Who wrote a comment or an issue body: its author, whoever edited it last, and how the author relates to the repo. */
export interface GqlAuthored {
  author: { login: string } | null;
  /** The person who edited it; null when it was never edited, or when GitHub can't name them (a deleted account). */
  editor?: { login: string } | null;
  /** When it was last edited; null when never. */
  lastEditedAt?: string | null;
  /** `OWNER`, `MEMBER`, `COLLABORATOR`, `CONTRIBUTOR`, `NONE`, …: of the author. */
  authorAssociation?: string;
}

export interface GqlComment extends GqlAuthored {
  databaseId: number;
  body: string;
  createdAt: string;
}

export interface GqlIssue extends GqlAuthored {
  id: string;
  databaseId: number;
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
  stateReason: 'COMPLETED' | 'NOT_PLANNED' | 'DUPLICATE' | 'REOPENED' | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: { nodes: { name: string }[] };
  assignees: { nodes: { login: string }[] };
  comments: { nodes: GqlComment[] };
  blockedBy?: { nodes: { number: number }[] };
  subIssues?: { nodes: GqlIssue[] };
}

const AUTHORED = `author { login } editor { login } lastEditedAt authorAssociation`;

const ISSUE_FIELDS = `id databaseId number title body state stateReason createdAt updatedAt closedAt ${AUTHORED}
  labels(first: 30) { nodes { name } }
  assignees(first: 5) { nodes { login } }
  comments(first: 100) { nodes { databaseId body createdAt ${AUTHORED} } }`;

/** One trail with its tickets, and `viewer`: the account behind the token, whose markers are this machine's own. */
export const TRAIL_QUERY = `query Trail($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      ${ISSUE_FIELDS}
      subIssues(first: 100) { nodes { ${ISSUE_FIELDS} blockedBy(first: 50) { nodes { number } } } }
    }
  }
}`;

export const labelNames = (ls: ({ name: string } | string)[]) => ls.map((l) => (typeof l === 'string' ? l : l.name));

export const apiBase = (apiUrl: string | undefined) => (apiUrl ?? DEFAULT_API).replace(/\/$/, '');

export const graphqlUrl = (api: string) =>
  /\/api\/v3$/.test(api) ? api.replace(/\/api\/v3$/, '/api/graphql') : `${api}/graphql`;

export function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': BRAND.slug,
  };
}
