import type { TrackerAdapter } from '../../adapters/adapter';
import { journalFile } from '../../history/journalFile';
import type { SetupTicketEntry } from '../../model/setupTicket';

/**
 * Marks a ticket as its trail's setup ticket, after `setupRefusal` said it may be: the field is written like any
 * other ticket field (signed on a markdown tracker, the meta marker on GitHub and Linear) and the mark is journaled.
 */
export async function markSetupTicket(o: {
  adapter: TrackerAdapter;
  root: string;
  mapId: string;
  ticketId: string;
  by: string;
}): Promise<void> {
  await o.adapter.setMeta(o.mapId, o.ticketId, { setup: true });
  const entry: SetupTicketEntry = {
    v: 1,
    kind: 'setup-ticket',
    at: Date.now(),
    mapId: o.mapId,
    ticketId: o.ticketId,
    actor: o.by,
    actorKind: 'agent',
  };
  journalFile(o.root).append(entry);
}
