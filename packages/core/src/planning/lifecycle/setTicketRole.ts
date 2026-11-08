import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import { OperationError } from '../operations/operationError';

/**
 * Sets or clears (`null`) a ticket's role. The trail lead may change any ticket's role. An agent may only give a role
 * to a ticket it just added: open, unclaimed and without one, so no agent picks the rules for work it holds.
 * Callers check the role is installed and active (`assertRoleUsable`).
 */
export async function setTicketRole(
  adapter: TrackerAdapter,
  target: { mapId: string; ticketId: string },
  role: string | null,
  actorKind: ActorKind,
) {
  if (actorKind === 'agent') {
    const snap = await adapter.loadMap(target.mapId);
    const t = snap.tickets.find((x) => x.id === target.ticketId);
    if (!t) throw new OperationError(`ticket ${target.ticketId} not found`);
    const fresh = t.state === 'open' && !t.assignee && !t.role;
    if (!fresh || role === null) throw new OperationError(`only the trail lead can change the role of ${t.key}`);
  }
  await adapter.setMeta(target.mapId, target.ticketId, { role });
}
