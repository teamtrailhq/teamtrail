export const DEFAULT_API = 'https://api.linear.app/graphql';

export interface LIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  state: { type: string };
  labels: { nodes: { id: string; name: string }[] };
  assignee: { displayName: string } | null;
  comments: { nodes: LComment[] };
  inverseRelations?: { nodes: { type: string; issue: { id: string } }[] };
  children?: { nodes: LIssue[] };
}

export interface LComment {
  id: string;
  body: string;
  createdAt: string;
  /** Null for a comment an integration or app posted. `guest`: a guest of the workspace; `active` false: deactivated. */
  user: { id?: string; displayName: string; email?: string | null; guest?: boolean; active?: boolean } | null;
}

export const ISSUE_FIELDS = `id identifier title description createdAt updatedAt completedAt canceledAt
  state { type }
  labels { nodes { id name } }
  assignee { displayName }
  comments(first: 100) { nodes { id body createdAt user { id displayName email guest active } } }`;

/** One trail with its tickets, and `viewer`: the user behind the key, whose comments are this machine's own. */
export const TRAIL_QUERY = `query Trail($id: String!) {
  viewer { id }
  issue(id: $id) {
    ${ISSUE_FIELDS}
    children(first: 100) { nodes { ${ISSUE_FIELDS} inverseRelations(first: 50) { nodes { type issue { id } } } } }
  }
}`;

export const TEAM_QUERY = `query Team($id: String!, $prefix: String!) {
  team(id: $id) { id key name states { nodes { id name type position } } }
  issueLabels(first: 100, filter: { name: { startsWith: $prefix } }) { nodes { id name team { id } } }
}`;

/** Issues and comments changed at or after a stamp; a page with more after it means "read everything again". */
export const CHANGES_QUERY = `query Changes($issues: IssueFilter, $comments: CommentFilter, $first: Int) {
        issues(first: $first, filter: $issues) {
          nodes { id updatedAt parent { id } labels { nodes { name } } }
          pageInfo { hasNextPage }
        }
        comments(first: $first, filter: $comments) {
          nodes { id updatedAt issue { id parent { id } } }
          pageInfo { hasNextPage }
        }
      }`;

/** The team's most recently updated issue: where the change cursor starts, by Linear's clock rather than ours. */
export const LATEST_QUERY = `query Latest($issues: IssueFilter) {
        issues(first: 1, orderBy: updatedAt, filter: $issues) { nodes { updatedAt } }
      }`;

export interface LChanges {
  issues: {
    nodes: { id: string; updatedAt: string; parent: { id: string } | null; labels: { nodes: { name: string }[] } }[];
    pageInfo?: { hasNextPage: boolean };
  };
  comments: {
    nodes: { id?: string; updatedAt: string; issue: { id: string; parent: { id: string } | null } | null }[];
    pageInfo?: { hasNextPage: boolean };
  };
}

export const isClosed = (s: { type: string }) => s.type === 'completed' || s.type === 'canceled';
