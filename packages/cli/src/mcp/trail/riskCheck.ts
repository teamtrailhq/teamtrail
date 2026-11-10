import { madeBy, OperationError, riskLevelFor, type DecisionRisk, type RiskCategory } from '@teamtrail/core';
import { readPolicy } from '@teamtrail/core/agents';

export interface RiskQuery {
  root: string;
  category?: RiskCategory;
  paths?: string[];
  /** Who makes the call: an agent trail name, `trail lead`, or `slack:U…`. */
  decidedBy: string;
}

/**
 * The policy level of a decision about to be recorded. Agents may not decide high-risk calls: that throws, telling
 * them to ask. The human's own answers are always allowed: callers pass `decidedBy` from a recorded answer, never
 * from a tool argument. Undefined when the
 * call names no category and no files.
 */
export function checkRisk(q: RiskQuery): DecisionRisk | undefined {
  const { policy } = readPolicy(q.root);
  const risk = riskLevelFor({ category: q.category, paths: q.paths }, policy);
  if (risk?.level !== 'high') return risk;
  const byAgent = madeBy({ decidedBy: q.decidedBy, source: { kind: 'agent' } }) === 'agent';
  if (byAgent) throw new OperationError(askInstead(risk));
  return risk;
}

function askInstead(risk: DecisionRisk) {
  const category = risk.category ? ` with category "${risk.category}"` : '';
  return (
    `High-risk call (${risk.reason}): the project's risk policy says the human decides this, not an agent. ` +
    `Ask with ask_human${category}. Once they answer, close the ticket, or record_decision with decidedBy "trail lead": their answer is what makes it theirs.`
  );
}
