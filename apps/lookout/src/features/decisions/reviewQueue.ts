import { type AuditDecision, decisionStatus, madeBy } from '@teamtrail/core';
import { keptKey } from './keptKey';

/**
 * The Logbook's "Agents decided · N to review": the calls an agent made itself, still in force and not yet kept by
 * this person. A teammate's record or one read from text is never an agent's (`madeBy`), so it never asks here.
 * Everything else stays in the ledger, in its order.
 */
export function splitForReview(rows: AuditDecision[], kept: (key: string) => boolean) {
  const review: AuditDecision[] = [];
  const ledger: AuditDecision[] = [];
  for (const d of rows) {
    const asks = madeBy(d) === 'agent' && decisionStatus(d) === 'active' && !kept(keptKey(d));
    (asks ? review : ledger).push(d);
  }
  return { review, ledger };
}
