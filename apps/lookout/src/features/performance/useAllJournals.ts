import { type MapSnapshot, type TransitionEntry } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';

/** Every trail's lifecycle journal, refetched when any ticket changes. */
export function useAllJournals(snaps: MapSnapshot[]) {
  const [journals, setJournals] = useState<Record<string, TransitionEntry[]>>({});
  const version = snaps.map((s) => `${s.map.id}:${s.tickets.reduce((n, t) => Math.max(n, t.updatedAt), 0)}`).join();
  useEffect(() => {
    let live = true;
    void Promise.all(
      snaps.map(async (s) => {
        const r = await fetch(`${apiBase()}/journal?mapId=${encodeURIComponent(s.map.id)}`).catch(() => undefined);
        const body = r?.ok ? ((await r.json()) as { entries: TransitionEntry[] }) : { entries: [] };
        return [s.map.id, body.entries] as const;
      }),
    ).then((pairs) => {
      if (live) setJournals(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return journals;
}
