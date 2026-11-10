/** What a call touches, for the risk policy (`.teamtrail/policy.json`). */
export const RISK_CATEGORIES = [
  'schema',
  'breaking-api',
  'auth-permissions',
  'billing',
  'data-deletion',
  'product-behaviour',
  'dependencies',
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** low: the agent decides. medium: the agent follows conventions and records the decision. high: the human decides. */
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Files matching `glob` carry `level`, whatever the category. */
export interface RiskPathRule {
  glob: string;
  level: RiskLevel;
  category?: RiskCategory;
}

export interface RiskPolicy {
  v: 1;
  categories: Record<RiskCategory, RiskLevel>;
  paths: RiskPathRule[];
}

/** The level a call got from the policy, and why. Kept on the decision record. */
export interface DecisionRisk {
  level: RiskLevel;
  category?: RiskCategory;
  reason: string;
  /** Other categories the call reaches at this same level (its files under another category's rule). */
  also?: RiskCategory[];
}

export const isRiskCategory = (v: unknown): v is RiskCategory => RISK_CATEGORIES.includes(v as RiskCategory);
export const isRiskLevel = (v: unknown): v is RiskLevel => RISK_LEVELS.includes(v as RiskLevel);
