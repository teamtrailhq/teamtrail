import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import { OperationError } from '../operations/operationError';

/**
 * Sets or clears (`null`) a ticket's guide. The trail lead may change any ticket's guide. An agent may only give a guide
 * to a ticket it just added: open, unclaimed and without one, so no agent picks the rules for work it holds.
 * Callers check the guide is installed and active (`assertGuideUsable`).
 */
export async function setTicketGuide(
  adapter: TrackerAdapter,
  target: { mapId: string; ticketId: string },
  guide: string | null,
  actorKind: ActorKind,
) {
  if (actorKind === 'agent') {
    const snap = await adapter.loadMap(target.mapId);
    const t = snap.tickets.find((x) => x.id === target.ticketId);
    if (!t) throw new OperationError(`ticket ${target.ticketId} not found`);
    const fresh = t.state === 'open' && !t.assignee && !t.guide;
    if (!fresh || guide === null) throw new OperationError(`only the trail lead can change the guide of ${t.key}`);
  }
  await adapter.setMeta(target.mapId, target.ticketId, { guide });
}
