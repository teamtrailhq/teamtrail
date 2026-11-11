import { type TicketCriteria } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';
import { responseError } from '../../lib/responseError';

const api = `${apiBase()}/criteria`;

type Shown = TicketCriteria & { hash?: string };

async function fetchCriteria(mapId?: string): Promise<Shown[]> {
  if (!mapId) return [];
  const r = await fetch(`${api}?mapId=${encodeURIComponent(mapId)}`);
  return r.ok ? ((await r.json()) as { tickets: Shown[] }).tickets : [];
}

/** A trail's acceptance criteria (`/criteria`), live: refetched when a `criteria/` file changes. */
export function useCriteria(mapId?: string) {
  /** Each with the hash of the criteria as shown: confirming names it, so criteria changed since aren't confirmed. */
  const [tickets, setTickets] = useState<Shown[]>([]);
  const { reload } = useLiveLoad({
    view: mapId,
    load: () => fetchCriteria(mapId),
    show: setTickets,
    failed: () => setTickets([]),
    changed: (path) => path.startsWith('criteria/'),
  });
  const confirm = (body: { title: string; ticketId: string; ticketKey: string; confirmed: boolean; hash?: string }) =>
    fetch(`${api}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, ...body }),
    })
      .catch(() => undefined)
      .then(async (r) => {
        const error = await responseError(r);
        reload();
        return error;
      });
  return { tickets, confirm };
}
