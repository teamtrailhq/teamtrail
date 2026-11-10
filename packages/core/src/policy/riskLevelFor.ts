import { globMatch } from '../knowledge/knowledge';
import { RISK_LEVELS, type DecisionRisk, type RiskCategory, type RiskPolicy } from '../model/risk';

/** What a call is about: the category the agent named and the files it touches. */
export interface RiskSubject {
  category?: RiskCategory;
  paths?: string[];
}

const rank = (r: DecisionRisk) => RISK_LEVELS.indexOf(r.level);

/**
 * The level the policy gives a call, with the reason. The highest of the category's level and any matching
 * path rule wins; ties keep the category, and name the others at that level in `also`. Without a category or paths there is nothing to judge: undefined.
 */
export function riskLevelFor(subject: RiskSubject, policy: RiskPolicy): DecisionRisk | undefined {
  const paths = subject.paths ?? [];
  if (!subject.category && !paths.length) return undefined;
  const found: DecisionRisk[] = [];
  if (subject.category) {
    const level = policy.categories[subject.category];
    found.push({ level, category: subject.category, reason: `${subject.category} is ${level} risk` });
  }
  for (const rule of policy.paths) {
    const hit = paths.find((p) => globMatch(rule.glob, p));
    if (!hit) continue;
    const category = rule.category ?? subject.category;
    found.push({
      level: rule.level,
      ...(category ? { category } : {}),
      reason: `${hit} matches ${rule.glob} (${rule.level})`,
    });
  }
  if (!found.length) return { level: 'low', reason: 'no risky category or path' };
  const top = found.reduce((best, r) => (rank(r) > rank(best) ? r : best));
  const also = [...new Set(found.filter((r) => rank(r) === rank(top)).map((r) => r.category))].filter(
    (c): c is RiskCategory => !!c && c !== top.category,
  );
  return also.length ? { ...top, also } : top;
}
