import { type MapSnapshot } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerEvent } from '../../lib/trackerChanges';
import type { RerouteView } from './types';

const api = `${apiBase()}/reroutes`;

/**
 * The trail's reroute proposals (`/reroutes`), live: refetched on the `reroute` event for this trail and when the
 * map changes (an approved proposal changes it). `pending` is the first pending proposal, if any.
 */
export function useReroutes(snap?: MapSnapshot) {
  const mapId = snap?.map.id;
  const [reroutes, setReroutes] = useState<RerouteView[]>([]);
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    if (!mapId) return setReroutes([]);
    void fetch(`${api}?map=${encodeURIComponent(mapId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ reroutes: RerouteView[] }>) : { reroutes: [] }))
      .then((b) => setReroutes(b.reroutes))
      .catch(() => setReroutes([]));
  }, [mapId]);
  const version = snap?.tickets.reduce((n, t) => Math.max(n, t.updatedAt), snap.map.updatedAt);
  useEffect(load, [load, version]);
  useEffect(
    () =>
      onTrackerEvent('reroute', (data) => {
        if ((data as { mapId?: string }).mapId === mapId) load();
      }),
    [load, mapId],
  );

  /** Resolves true when the call went through; on failure the error is kept for the dialog. */
  const decide = async (action: 'approve' | 'reject', id: string, note?: string) => {
    const r = await fetch(`${api}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // the proposal as this page shows it: the bridge refuses the approval if the file changed since
      body: JSON.stringify({ mapId, id, note, hash: reroutes.find((p) => p.id === id)?.hash }),
    });
    const b = (await r.json().catch(() => ({}))) as { error?: string; errors?: { message: string }[] };
    if (r.ok) {
      setError(undefined);
      load();
      return true;
    }
    const details = b.errors?.map((e) => e.message).join('; ');
    setError([b.error ?? `HTTP ${r.status}`, details].filter(Boolean).join(': '));
    return false;
  };

  return {
    reroutes,
    pending: reroutes.find((p) => p.status === 'pending'),
    error,
    clearError: () => setError(undefined),
    approve: (id: string, note?: string) => decide('approve', id, note),
    reject: (id: string, note: string) => decide('reject', id, note),
  };
}
