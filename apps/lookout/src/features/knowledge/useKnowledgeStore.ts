import { type KnowledgeCall, type KnowledgeEntry } from '@teamtrail/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerChange } from '../../lib/trackerChanges';
import type { KnowledgeDraft, KnowledgeStore } from './knowledgeContext';

const api = `${apiBase()}/knowledge`;

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
  return b;
}

/** Project knowledge for the Lookout (`/knowledge`), live: refetched when a `knowledge/` file changes. */
export function useKnowledgeStore(briefText: string): KnowledgeStore {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [stale, setStale] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    void fetch(api)
      .then((r) =>
        r.ok ? (r.json() as Promise<{ entries: KnowledgeEntry[]; stale: Record<string, string[]> }>) : null,
      )
      .then((b) => {
        if (!b) return;
        setEntries(b.entries);
        setStale(b.stale);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    return onTrackerChange((path) => path.startsWith('knowledge/') && load());
  }, [load]);
  const attention = useMemo(
    () => entries.filter((e) => e.status === 'suggested' || e.flag || (stale[e.id] && e.status !== 'outdated')).length,
    [entries, stale],
  );
  return {
    entries,
    stale,
    briefText,
    attention,
    open,
    setOpen,
    error,
    call: (id: string, call: KnowledgeCall) =>
      post('/call', { id, call }).then(
        () => (setError(undefined), load(), true),
        (e: Error) => (setError(e.message), false),
      ),
    propose: (draft: KnowledgeDraft) =>
      post<{ entry: KnowledgeEntry }>('/propose', draft).then(
        (b) => (load(), b.entry),
        (e: Error) => (setError(e.message), undefined),
      ),
  };
}
