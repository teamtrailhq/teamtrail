import { madeBy, type AuditDecision } from '@teamtrail/core';
import { label } from '../blocks';

/** Who made a call, as Scout says it. Text-derived records are never the human's (`madeBy`). */
export function decidedBy(d: AuditDecision) {
  const who = madeBy(d);
  if (who === 'human') return 'trail lead';
  if (who === 'teammate') return label(d.postedBy ?? d.decidedBy);
  if (who === 'unverified') return 'unverified';
  return `agent ${label(d.decidedBy)}`;
}
