import type { TrackerAdapter } from '../../adapters/adapter';
import { addedGuides } from '../../guides/ticketGuideIds';
import { trailGuidesByType } from '../../guides/trailGuidesByType';
import type { ActorKind, TicketMetaPatch } from '../../model/lifecycle';
import type { MapDoc, Ticket } from '../../model/types';
import { OperationError } from '../operations/operationError';

/** One change to a ticket's guides: add a guide to it, or take one off it. */
export type TicketGuideChange = { kind: 'add'; id: string } | { kind: 'remove'; id: string };

const listOrNull = (ids: string[]) => (ids.length ? ids : null);

/**
 * The ticket's overrides after `change`: adding a guide its type has takes it off the removed list, else it is
 * added; removing one added to the ticket drops it, and removing one its type has puts it on the removed list. The
 * single `guide` of older tickets moves into `guidesAdded`.
 */
export function ticketGuidesPatch(map: MapDoc, t: Ticket, change: TicketGuideChange): TicketMetaPatch {
  const inherited = trailGuidesByType(map).byType[t.type] ?? [];
  let added = addedGuides(t);
  let removed = [...(t.guidesRemoved ?? [])];
  const { id } = change;
  switch (change.kind) {
    case 'add':
      removed = removed.filter((x) => x !== id);
      if (!inherited.includes(id) && !added.includes(id)) added = [...added, id];
      break;
    case 'remove':
      added = added.filter((x) => x !== id);
      if (inherited.includes(id) && !removed.includes(id)) removed = [...removed, id];
      break;
    default: {
      const never: never = change;
      throw new OperationError(`unknown change ${JSON.stringify(never)}`);
    }
  }
  return { guide: null, guidesAdded: listOrNull(added), guidesRemoved: listOrNull(removed) };
}

/**
 * Adds a guide to a ticket or takes one off it. The trail lead may change any ticket's guides, written as theirs
 * (`confirm`). An agent may only add a guide to a ticket it just added: open, unclaimed and without overrides, so no
 * agent picks the rules for work it holds or weakens them. Callers check an added guide is active (`guideProblem`).
 */
export async function setTicketGuides(
  adapter: TrackerAdapter,
  target: { mapId: string; ticketId: string },
  change: TicketGuideChange,
  actorKind: ActorKind,
) {
  const snap = await adapter.loadMap(target.mapId);
  const t = snap.tickets.find((x) => x.id === target.ticketId);
  if (!t) throw new OperationError(`ticket ${target.ticketId} not found`);
  if (actorKind !== 'trail lead') {
    const fresh = t.state === 'open' && !t.assignee && !addedGuides(t).length && !t.guidesRemoved?.length;
    if (!fresh || change.kind !== 'add')
      throw new OperationError(`only the trail lead can change the guides of ${t.key}`);
  }
  const confirm = actorKind === 'trail lead' ? { confirm: true as const } : {};
  await adapter.setMeta(target.mapId, t.id, { ...ticketGuidesPatch(snap.map, t, change), ...confirm });
}
