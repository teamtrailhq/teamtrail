import { type MapSnapshot, type TransitionEntry } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { apiBase } from '../lib/apiBase';

/** A trail's lifecycle journal (`GET /journal`), refetched whenever its tickets change. */
export function useJournal(snap?: MapSnapshot) {
  const [entries, setEntries] = useState<TransitionEntry[]>([]);
  const mapId = snap?.map.id;
  const version = snap?.tickets.reduce((n, t) => Math.max(n, t.updatedAt), snap.map.updatedAt) ?? 0;
  useEffect(() => {
    if (!mapId) return;
    let live = true;
    void fetch(`${apiBase()}/journal?mapId=${encodeURIComponent(mapId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ entries: TransitionEntry[] }>) : { entries: [] }))
      .then((b) => live && setEntries(b.entries))
      .catch(() => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [mapId, version]);
  return entries;
}
