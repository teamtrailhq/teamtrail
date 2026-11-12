import type { RiskCategory } from '../model/risk';
import type { VerificationAttempt } from '../model/verification';
import { readAttempt } from '../verification/evidenceStore';
import { caseInsensitiveFs } from './caseInsensitiveFs';
import { readPolicy } from './policyStore';
import { ruleMatches } from './ruleMatches';
import { touchedBy } from './touchedBy';

/**
 * Whether only the Lookout can give the human's word on something: a question asked with a category the project's
 * risk policy makes high, or a completion whose files match a high-risk path rule. Slack answers reach this machine
 * through the Scout service, so they never stand in for the human on these (answerVia.ts `approvesHighRisk`).
 */
export const needsLookout = {
  question(root: string, q: { category?: RiskCategory; categories?: RiskCategory[] }): boolean {
    const { policy } = readPolicy(root);
    const asked = [q.category, ...(q.categories ?? [])].filter((c): c is RiskCategory => !!c);
    return asked.some((c) => policy.categories[c] === 'high');
  },

  attempt(root: string, a: VerificationAttempt | undefined): boolean {
    if (!a) return false;
    const rules = readPolicy(root).policy.paths.filter((r) => r.level === 'high');
    const fold = caseInsensitiveFs(root);
    return touchedBy(a).all.some((p) => rules.some((r) => ruleMatches(r.glob, p, fold)));
  },

  /** The completion an approval is about, read from its evidence. */
  approval(root: string, i: { mapId: string; ticketId: string; attemptId?: string }): boolean {
    return !!i.attemptId && needsLookout.attempt(root, readAttempt(root, i.mapId, i.ticketId, i.attemptId));
  },
};
