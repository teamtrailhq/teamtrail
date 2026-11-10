import type { GqlAuthored, GqlIssue } from './schema';

/** A trail issue, its sub-issues and every comment on them: everything whose writer decides how it reads. */
export function authoredIn(root: GqlIssue): GqlAuthored[] {
  const issues = [root, ...(root.subIssues?.nodes ?? [])];
  return issues.flatMap((i) => [i, ...i.comments.nodes]);
}
