import { type AttentionPrefs, type AttentionView } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onServerEvent } from '../../lib/trackerChanges';

const api = `${apiBase()}/attention`;
/** Bursts of tracker changes refetch once. */
const NUDGE_MS = 250;

async function send(path: string, method: 'POST' | 'PUT', body: unknown) {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => ({}))) as { error?: string; errors?: string[] };
  if (!r.ok) throw new Error(b.errors?.join('; ') ?? b.error ?? `HTTP ${r.status}`);
  return b;
}

export interface AttentionApi {
  /** Undefined until the first load, or when the server has no attention route. */
  view?: AttentionView;
  error?: string;
  snooze: (id: string, minutes: number) => void;
  dismiss: (id: string) => void;
  savePrefs: (prefs: AttentionPrefs) => Promise<boolean>;
}

/**
 * The ranked attention queue (`GET /attention`), live through the `attention` event on the shared stream.
 * `nudge` changes when the app knows something moved (a question arrived, a ticket changed), to refetch at once
 * instead of waiting for the server's next tick.
 */
export function useAttention(nudge: unknown): AttentionApi {
  const [view, setView] = useState<AttentionView>();
  const [error, setError] = useState<string>();
  const load = useCallback(() => {
    void fetch(api)
      .then((r) => (r.ok ? (r.json() as Promise<AttentionView>) : undefined))
      .then((v) => v && setView(v))
      .catch(() => {});
  }, []);
  useEffect(() => onServerEvent('attention', (data) => setView(JSON.parse(data) as AttentionView)), []);
  useEffect(() => {
    const t = setTimeout(load, NUDGE_MS);
    return () => clearTimeout(t);
  }, [load, nudge]);
  const act = (path: string, body: unknown) =>
    void send(path, 'POST', body).then(
      () => (setError(undefined), load()),
      (e: Error) => setError(e.message),
    );
  return {
    view,
    error,
    snooze: (id, minutes) => act('/snooze', { id, minutes }),
    dismiss: (id) => act('/dismiss', { id }),
    savePrefs: (prefs) =>
      send('/prefs', 'PUT', prefs).then(
        () => (setError(undefined), load(), true),
        (e: Error) => (setError(e.message), false),
      ),
  };
}
