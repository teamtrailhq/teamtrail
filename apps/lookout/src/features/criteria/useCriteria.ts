import { type TicketCriteria } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerChange } from '../../lib/trackerChanges';

const api = `${apiBase()}/criteria`;

/** A trail's acceptance criteria (`/criteria`), live: refetched when a `criteria/` file changes. */
export function useCriteria(mapId?: string) {
  const [tickets, setTickets] = useState<TicketCriteria[]>([]);
  const load = useCallback(() => {
    if (!mapId) return setTickets([]);
    void fetch(`${api}?mapId=${encodeURIComponent(mapId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ tickets: TicketCriteria[] }>) : { tickets: [] }))
      .then((b) => setTickets(b.tickets))
      .catch(() => setTickets([]));
  }, [mapId]);
  useEffect(() => {
    load();
    return onTrackerChange((path) => path.startsWith('criteria/') && load());
  }, [load]);
  const confirm = (body: { title: string; ticketId: string; ticketKey: string; confirmed: boolean }) =>
    fetch(`${api}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, ...body }),
    }).then(load);
  return { tickets, confirm };
}
