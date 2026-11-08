import { type DiscoveryBrief, type MapSnapshot } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerChange } from '../../lib/trackerChanges';

const api = `${apiBase()}/briefs`;

/** The trail's discovery brief (`/briefs`), live: refetched when a `briefs/` file changes or the trail does. */
export function useBrief(snap?: MapSnapshot) {
  const mapId = snap?.map.id;
  const [brief, setBrief] = useState<DiscoveryBrief | null>(null);
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    if (!mapId) return setBrief(null);
    void fetch(`${api}?mapId=${encodeURIComponent(mapId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ brief: DiscoveryBrief | null }>) : { brief: null }))
      .then((b) => setBrief(b.brief))
      .catch(() => setBrief(null));
  }, [mapId]);
  const version = snap?.tickets.reduce((n, t) => Math.max(n, t.updatedAt), snap.map.updatedAt);
  useEffect(load, [load, version]);
  useEffect(() => onTrackerChange((path) => path.startsWith('briefs/') && load()), [load]);
  const post = (action: 'accept' | 'request-changes', note?: string) =>
    fetch(`${api}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, note }),
    }).then(async (r) => {
      const b = (await r.json().catch(() => ({}))) as { brief?: DiscoveryBrief; error?: string };
      if (!r.ok || !b.brief) throw new Error(b.error ?? `HTTP ${r.status}`);
      setError(undefined);
      setBrief(b.brief);
    });
  /** Resolves true when the call went through; on failure the error is shown and the dialog stays open. */
  const act = (action: 'accept' | 'request-changes', note?: string) =>
    post(action, note).then(
      () => true,
      (e: Error) => (setError(e.message), false),
    );
  return {
    brief,
    error,
    accept: () => act('accept'),
    requestChanges: (note: string) => act('request-changes', note),
  };
}
