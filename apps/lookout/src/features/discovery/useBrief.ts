import { type DiscoveryBrief, type MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

const api = `${apiBase()}/briefs`;

type Loaded = { brief: DiscoveryBrief | null; hash?: string };

async function fetchBrief(mapId?: string): Promise<Loaded> {
  if (!mapId) return { brief: null };
  const r = await fetch(`${api}?mapId=${encodeURIComponent(mapId)}`);
  return r.ok ? ((await r.json()) as Loaded) : { brief: null };
}

/** The trail's discovery brief (`/briefs`), live: refetched when a `briefs/` file changes or the trail does. */
export function useBrief(snap?: MapSnapshot) {
  const mapId = snap?.map.id;
  const [brief, setBrief] = useState<DiscoveryBrief | null>(null);
  const [error, setError] = useState<string>();
  /** The hash of the brief as shown: accepting names it, so a brief resubmitted meanwhile is not accepted. */
  const [hash, setHash] = useState<string>();
  const { reload, pushed } = useLiveLoad({
    view: mapId,
    version: snap?.tickets.reduce((n, t) => Math.max(n, t.updatedAt), snap.map.updatedAt),
    load: () => fetchBrief(mapId),
    show: (b) => {
      setBrief(b.brief);
      setHash(b.hash);
    },
    failed: () => setBrief(null),
    changed: (path) => path.startsWith('briefs/'),
  });
  /** `shown`: the hash of the brief as the trail lead opened it (useShown), sent with accept. */
  const post = (action: 'accept' | 'request-changes', note?: string, shown?: string) =>
    fetch(`${api}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, note, hash: shown }),
    }).then(async (r) => {
      const b = (await r.json().catch(() => ({}))) as { brief?: DiscoveryBrief; error?: string };
      if (!r.ok || !b.brief) throw new Error(b.error ?? `HTTP ${r.status}`);
      setError(undefined);
      // the brief as the server wrote it: a load started before it is older
      pushed();
      setBrief(b.brief);
    });
  /** Resolves true when the call went through; on failure the error is shown and the dialog stays open. */
  const act = (action: 'accept' | 'request-changes', note?: string, shown?: string) =>
    post(action, note, shown).then(
      () => true,
      (e: Error) => (setError(e.message), reload(), false),
    );
  return {
    brief,
    error,
    hash,
    accept: (shown?: string) => act('accept', undefined, shown),
    requestChanges: (note: string) => act('request-changes', note),
  };
}
