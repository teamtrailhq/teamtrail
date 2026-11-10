import { globMatch } from '../knowledge/knowledge';

/** Whether a policy path rule covers a repo-relative path; `fold` ignores case, for case-insensitive filesystems. */
export function ruleMatches(glob: string, path: string, fold = false) {
  return fold ? globMatch(glob.toLowerCase(), path.toLowerCase()) : globMatch(glob, path);
}
