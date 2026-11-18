import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { loadTicketAutoMerge } from '../../lib/loadTicketAutoMerge';
import type { TicketAutoMerge } from '../../lib/ticketAutoMergeOf';

/** A PR sync event that brought this ticket's pull request (core's VerificationSyncEvent: the tickets that changed). */
function syncedThis(data: unknown, key: string) {
  const e = data as { kind?: unknown; tickets?: unknown } | undefined;
  if (e?.kind !== 'sync' || !Array.isArray(e.tickets)) return false;
  return (e.tickets as { mapId?: unknown; ticketId?: unknown }[]).some((t) => `${t.mapId}/${t.ticketId}` === key);
}

/**
 * What the server's auto-merge says about one ticket (lib/loadTicketAutoMerge.ts): loaded once when the ticket opens
 * and again when PR sync brings its pull request, never on a timer. Undefined on the Lookout's own.
 */
export function useTicketAutoMerge(mapId: string, ticketId: string): TicketAutoMerge | undefined {
  const key = `${mapId}/${ticketId}`;
  const [shown, setShown] = useState<{ key: string; value?: TicketAutoMerge }>();
  useLiveLoad({
    load: () => loadTicketAutoMerge({ trail: mapId, ticket: ticketId }),
    show: (value) => setShown({ key, value }),
    view: key,
    events: { verification: (data) => syncedThis(data, key) },
  });
  return shown?.key === key ? shown.value : undefined;
}
