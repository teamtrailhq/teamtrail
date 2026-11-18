import { type DiscoveryBrief, type MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';
import { trustChanged } from '../../lib/trustChanged';

const api = `${apiBase()}/briefs`;

/**
 * `gated`: discovery still holds the trail's implementation tickets on this machine (core discoveryGate.ts);
 * `skipped`: the trail lead skipped discovery for it here.
 */
type Loaded = { brief: DiscoveryBrief | null; hash?: string; gated?: boolean; skipped?: boolean };

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
  const [gated, setGated] = useState(false);
  /** Whether discovery was skipped, for the trail it was loaded for: undefined until then. */
  const [stage, setStage] = useState<{ mapId?: string; skipped: boolean }>();
  const { reload, pushed } = useLiveLoad({
    view: mapId,
    version: snap?.tickets.reduce((n, t) => Math.max(n, t.updatedAt), snap.map.updatedAt),
    load: () => fetchBrief(mapId),
    show: (b) => {
      setBrief(b.brief);
      setHash(b.hash);
      setGated(!!b.gated);
      setStage({ mapId, skipped: !!b.skipped });
    },
    failed: () => (setBrief(null), setGated(false), setStage({ mapId, skipped: false })),
    changed: (path) => path.startsWith('briefs/'),
    // accepting or skipping is recorded on this machine only (the trust ledger), wherever it was done
    events: { trust: (data) => trustChanged(data).approvals },
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
      if (b.brief.status === 'accepted') setGated(false);
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
    gated,
    /** The trail's discovery stage once loaded for it (core trailDone's `discoverySkipped`); undefined until then. */
    discovery: mapId && stage?.mapId === mapId ? { skipped: stage.skipped } : undefined,
    accept: (shown?: string) => act('accept', undefined, shown),
    requestChanges: (note: string) => act('request-changes', note),
  };
}
