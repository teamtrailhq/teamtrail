import { useState } from 'react';
import { apiBase } from '../../lib/apiBase';

/** The trail lead's "this assumption holds" (`POST /assumptions/confirm`); the map refreshes through the tracker. */
export function useConfirmAssumption(mapId: string) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const confirm = async (id: string) => {
    setBusy(id);
    const r = await fetch(`${apiBase()}/assumptions/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, id }),
    }).catch(() => undefined);
    setBusy(undefined);
    if (r?.ok) return setError(undefined);
    const b = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(b?.error ?? 'Could not confirm it; is the Lookout connected?');
  };
  return { confirm, busy, error };
}
