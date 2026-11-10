import { madeBy, OperationError, riskLevelFor, type DecisionRisk, type RiskCategory } from '@teamtrail/core';
import { readPolicy } from '@teamtrail/core/agents';

export interface RiskQuery {
  root: string;
  category?: RiskCategory;
  paths?: string[];
  /** Who makes the call: an agent trail name, `trail lead`, or `slack:U…`. */
  decidedBy: string;
  /** The agent is connected over HTTP: it can't record a decision as the human's, only ask. */
  remote?: boolean;
}

/**
 * The policy level of a decision about to be recorded. Agents may not decide high-risk calls: that throws, telling
 * them to ask. The human's own answers (recorded with decidedBy trail lead) are always allowed. Undefined when the
 * call names no category and no files.
 */
export function checkRisk(q: RiskQuery): DecisionRisk | undefined {
  const { policy } = readPolicy(q.root);
  const risk = riskLevelFor({ category: q.category, paths: q.paths }, policy);
  if (risk?.level !== 'high') return risk;
  const byAgent = madeBy({ decidedBy: q.decidedBy, source: { kind: 'agent' } }) === 'agent';
  if (byAgent) throw new OperationError(askInstead(risk, !!q.remote));
  return risk;
}

function askInstead(risk: DecisionRisk, remote: boolean) {
  const category = risk.category ? ` with category "${risk.category}"` : '';
  const then = remote
    ? 'once they answer in the Lookout, close the ticket in this session: their answer is kept as the decision.'
    : 'then record their answer with decidedBy "operator".';
  return (
    `High-risk call (${risk.reason}): the project's risk policy says the human decides this, not an agent. ` +
    `Ask with ask_human${category}, ${then}`
  );
}
