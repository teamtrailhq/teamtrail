import type { PendingTracker, TrustItem } from '@teamtrail/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerChange } from '../../lib/trackerChanges';

export interface OldQueue {
  writes: number;
  targets: string[];
  labels: string[];
}

export interface ApprovalsView {
  items: TrustItem[];
  /** Nothing approved here yet: committed items may be adopted together. */
  firstRun: boolean;
  tracker?: PendingTracker;
  oldQueue?: OldQueue;
}

async function send(path: string, body: unknown) {
  const r = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as { error?: string; changed?: string[]; refused?: string[] };
  if (!r.ok) throw new Error(json.error ?? `Request failed (${r.status})`);
  return json;
}

const json = async <T>(r: Response) => (r.ok ? ((await r.json()) as T) : undefined);

async function fetchView(): Promise<ApprovalsView | null> {
  const [trust, trackers, queue] = await Promise.all(
    ['/trust', '/trackers', '/trackers/legacy-outbox'].map((p) => fetch(`${apiBase()}${p}`)),
  );
  const listed = await json<{ items: TrustItem[]; firstRun?: boolean }>(trust);
  if (!listed) return null;
  const { items } = listed;
  const tracker = (await json<{ pending?: PendingTracker }>(trackers))?.pending;
  const oldQueue = await json<OldQueue>(queue);
  const firstRun = listed.firstRun === true;
  return { items, firstRun, ...(tracker ? { tracker } : {}), ...(oldQueue?.writes ? { oldQueue } : {}) };
}

/** Two views list the same things, with the same content. */
const sameView = (a: ApprovalsView, b: ApprovalsView) =>
  JSON.stringify([a.items.map((i) => i.hash), a.tracker?.target, a.oldQueue?.writes]) ===
  JSON.stringify([b.items.map((i) => i.hash), b.tracker?.target, b.oldQueue?.writes]);

/** What a result says about items that weren't approved, in a sentence; nothing when all were. */
function note(r: { changed?: string[]; refused?: string[] }) {
  const parts = [
    r.changed?.length ? `${r.changed.length} changed while you looked, so they wait; look again` : '',
    r.refused?.length ? `${r.refused.length} not committed, so they need their own look` : '',
  ].filter(Boolean);
  return parts.length ? `${parts.join('. ')}.` : undefined;
}

/**
 * What the repo's files ask this machine to trust and the trail lead hasn't approved here. The list stays as it was
 * shown while the human is on it: when a file changes underneath, `changed` is set (a banner offers the new list)
 * instead of rows moving under the cursor. undefined while loading, null without a server. Every approval sends the
 * hashes of exactly the rows shown.
 */
export function useApprovals() {
  const [view, setView] = useState<ApprovalsView | null>();
  const [changed, setChanged] = useState(false);
  /** The view as shown, for comparing without re-subscribing. */
  const shown = useRef<ApprovalsView | null>();
  useEffect(() => void (shown.current = view), [view]);
  const load = useCallback(() => {
    setChanged(false);
    fetchView().then(setView, () => setView(null));
  }, []);
  /** A file changed: compare what the server lists now with what is shown, and only say so. */
  const recheck = useCallback(async () => {
    const next = await fetchView().catch(() => null);
    const was = shown.current;
    if (!next || !was || !sameView(next, was)) setChanged(true);
  }, []);
  useEffect(load, [load]);
  useEffect(() => onTrackerChange((p) => void (p.startsWith('.') || recheck())), [recheck]);
  const approve = useCallback(
    async (items: TrustItem[]) => {
      const r = await send('/trust/approve', { items: items.map((i) => ({ key: i.key, hash: i.hash })) });
      load();
      return note(r);
    },
    [load],
  );
  const act = useCallback(
    async (path: string, body: unknown) => {
      await send(path, body);
      load();
    },
    [load],
  );
  return { view, changed, load, approve, act };
}
