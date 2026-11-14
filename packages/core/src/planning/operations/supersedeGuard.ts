import { approvesHighRisk } from '../../model/answerVia';
import { highRiskRefusal } from '../../model/highRiskRefusal';
import type { DecisionRecord } from '../../model/types';
import { assertLookoutGuard, type LookoutGuard } from './lookoutGuard';
import { OperationError } from './operationError';

/**
 * Refuses superseding a decision that only the Lookout may make, as recording one is refused (lookoutGuard.ts):
 * the old decision's ticket counts whatever the new one names, and so does the risk the old one was recorded at, so
 * naming another ticket (or none) never moves a high-risk call out from under the guard.
 */
export async function assertSupersedeGuard(
  g: LookoutGuard & { sourceKind?: string },
  s: { mapId: string; old: DecisionRecord; next: { ticketId?: string; ticketKey?: string } },
) {
  const { mapId, old, next } = s;
  await assertLookoutGuard(g, { mapId, ticketId: old.ticketId, key: old.ticketKey ?? old.id });
  if (next.ticketId && next.ticketId !== old.ticketId)
    await assertLookoutGuard(g, { mapId, ticketId: next.ticketId, key: next.ticketKey });
  const via = g.via ?? (g.sourceKind === 'slack' ? 'slack' : undefined);
  if (via && !approvesHighRisk(via) && old.risk?.level === 'high')
    throw new OperationError(highRiskRefusal(old.id, via));
}
