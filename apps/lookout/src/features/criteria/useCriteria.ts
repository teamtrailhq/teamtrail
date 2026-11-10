import { type TicketCriteria } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { responseError } from '../../lib/responseError';
import { onTrackerChange } from '../../lib/trackerChanges';

const api = `${apiBase()}/criteria`;

/** A trail's acceptance criteria (`/criteria`), live: refetched when a `criteria/` file changes. */
export function useCriteria(mapId?: string) {
  /** Each with the hash of the criteria as shown: confirming names it, so criteria changed since aren't confirmed. */
  const [tickets, setTickets] = useState<(TicketCriteria & { hash?: string })[]>([]);
  const load = useCallback(() => {
    if (!mapId) return setTickets([]);
    void fetch(`${api}?mapId=${encodeURIComponent(mapId)}`)
      .then((r) =>
        r.ok ? (r.json() as Promise<{ tickets: (TicketCriteria & { hash?: string })[] }>) : { tickets: [] },
      )
      .then((b) => setTickets(b.tickets))
      .catch(() => setTickets([]));
  }, [mapId]);
  useEffect(() => {
    load();
    return onTrackerChange((path) => path.startsWith('criteria/') && load());
  }, [load]);
  const confirm = (body: { title: string; ticketId: string; ticketKey: string; confirmed: boolean; hash?: string }) =>
    fetch(`${api}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, ...body }),
    })
      .catch(() => undefined)
      .then(async (r) => {
        const error = await responseError(r);
        load();
        return error;
      });
  return { tickets, confirm };
}
