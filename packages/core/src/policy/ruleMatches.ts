import { globMatch } from '../knowledge/knowledge';

/**
 * Whether a policy path rule covers a repo-relative path, both in Unicode NFC; `fold` ignores case, for
 * case-insensitive filesystems.
 */
export function ruleMatches(glob: string, path: string, fold = false) {
  const g = glob.normalize('NFC');
  const p = path.normalize('NFC');
  return fold ? globMatch(g.toLowerCase(), p.toLowerCase()) : globMatch(g, p);
}
