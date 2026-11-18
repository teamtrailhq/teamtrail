import { pathCovered } from '../evidence/pathCovered';
import type { DiffRule } from '../model/diffRule';

/** A rule and the changed files that triggered it. */
export interface MatchedRule {
  rule: DiffRule;
  files: string[];
}

/**
 * The rules whose `when` globs match any of the files a change touched, in the file's order, each with the files that
 * matched (sorted). Deterministic: the same rules and files always give the same list.
 */
export function matchRules(rules: DiffRule[], files: string[]): MatchedRule[] {
  const sorted = [...new Set(files)].sort();
  return rules
    .map((rule) => ({ rule, files: sorted.filter((f) => rule.when.some((g) => pathCovered(g, f))) }))
    .filter((m) => m.files.length > 0);
}
