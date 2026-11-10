import type { LinearGql } from './linearGql';
import { ISSUE_FIELDS, type LIssue } from './schema';

/** The mutations the Linear adapter sends: issues are created in the team (and project, when set). */
export function linearWrites(gql: LinearGql, target: { teamId: string; projectId?: string }) {
  const home = { teamId: target.teamId, ...(target.projectId ? { projectId: target.projectId } : {}) };
  return {
    async create(input: Record<string, unknown>): Promise<LIssue> {
      const d = await gql<{ issueCreate: { issue: LIssue } }>(
        `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { issue { ${ISSUE_FIELDS} } } }`,
        { input: { ...home, ...input } },
      );
      return d.issueCreate.issue;
    },
    async update(id: string, input: Record<string, unknown>) {
      await gql(
        `mutation Update($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
        { id, input },
      );
    },
    /** Posts a comment and returns its id. */
    async comment(issueId: string, body: string): Promise<string> {
      const d = await gql<{ commentCreate: { comment: { id: string } } }>(
        `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id } } }`,
        { input: { issueId, body } },
      );
      return d.commentCreate.comment.id;
    },
    async editComment(id: string, body: string) {
      await gql(
        `mutation EditComment($id: String!, $input: CommentUpdateInput!) { commentUpdate(id: $id, input: $input) { success } }`,
        { id, input: { body } },
      );
    },
  };
}

export type LinearWrites = ReturnType<typeof linearWrites>;
