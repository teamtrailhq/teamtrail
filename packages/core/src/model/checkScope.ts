/**
 * A check a completion didn't run because none of its changed files is in the check's `paths` (verification.json),
 * as the attempt and its proof keep it: the trail lead scoped it to part of a monorepo when they approved the file.
 */
export interface OutOfScopeCheck {
  name: string;
  argv: string[];
  /** The check's `paths` as approved, repo-relative globs. */
  paths: string[];
  /** One line: `changes outside apps/web`. */
  reason: string;
}
