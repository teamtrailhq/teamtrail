import { RISK_LEVELS, type DecisionRisk, type RiskCategory, type RiskPolicy } from '../model/risk';
import { repoPaths } from './repoPath';
import { ruleMatches } from './ruleMatches';

/** What a call is about: the category the agent named and the files it touches. */
export interface RiskSubject {
  category?: RiskCategory;
  /** As declared: brought to repo-relative form here, and refused when absolute or outside the repo. */
  paths?: string[];
  /** The repo is on a filesystem that ignores case, so the path rules do too. */
  caseInsensitive?: boolean;
}

const rank = (r: DecisionRisk) => RISK_LEVELS.indexOf(r.level);

/**
 * The level the policy gives a call, with the reason. The highest of the category's level and any matching
 * path rule wins; ties keep the category. Without a category or paths there is nothing to judge: undefined.
 */
export function riskLevelFor(subject: RiskSubject, policy: RiskPolicy): DecisionRisk | undefined {
  const paths = repoPaths(subject.paths);
  if (!subject.category && !paths.length) return undefined;
  const found: DecisionRisk[] = [];
  if (subject.category) {
    const level = policy.categories[subject.category];
    found.push({ level, category: subject.category, reason: `${subject.category} is ${level} risk` });
  }
  for (const rule of policy.paths) {
    const hit = paths.find((p) => ruleMatches(rule.glob, p, subject.caseInsensitive));
    if (!hit) continue;
    const category = rule.category ?? subject.category;
    found.push({
      level: rule.level,
      ...(category ? { category } : {}),
      reason: `${hit} matches ${rule.glob} (${rule.level})`,
    });
  }
  if (!found.length) return { level: 'low', reason: 'no risky category or path' };
  return found.reduce((best, r) => (rank(r) > rank(best) ? r : best));
}
