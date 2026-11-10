import { checkCriteria, type CriteriaResult, type CriterionEvidence } from '../criteria/criteria';
import { readCriteria } from '../criteria/criteriaStore';
import type { CheckResult } from '../model/verification';

/**
 * The ticket's criteria as they are in force (a proposed change is not), matched to the agent's evidence, with
 * whether the trail lead had confirmed them. Undefined when the ticket has none.
 */
export function gradeCriteria(
  at: { root: string; mapId: string; ticketId: string; evidence?: CriterionEvidence[] },
  checks: CheckResult[],
): CriteriaResult | undefined {
  const entry = readCriteria(at.root, at.mapId).find((t) => t.ticketId === at.ticketId);
  if (!entry?.criteria.length) return undefined;
  return { ...checkCriteria(entry.criteria, at.evidence ?? [], checks), confirmed: !!entry.confirmed };
}
