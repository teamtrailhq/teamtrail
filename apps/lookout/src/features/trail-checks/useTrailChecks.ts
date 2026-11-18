import type { TrailChecksView } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';
import { responseError } from '../../lib/responseError';

const api = () => `${apiBase()}/trail-checks`;

const post = (path: string, body: unknown) =>
  fetch(`${api()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);

/**
 * The trail verified together (`GET /trail-checks`), live on the `trail-checks` event, with the trail lead's Run now /
 * Run again (`run`) and Add a fix ticket (`fixTicket`). An action's error shows until the next one.
 */
export function useTrailChecks(mapId?: string) {
  const [view, setView] = useState<TrailChecksView>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { reload } = useLiveLoad({
    view: mapId,
    load: async () => {
      if (!mapId) return undefined;
      const r = await fetch(`${api()}?mapId=${encodeURIComponent(mapId)}`);
      return r.ok ? ((await r.json()) as TrailChecksView) : undefined;
    },
    show: setView,
    events: { 'trail-checks': () => true },
  });
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    const r = await post(path, body);
    setBusy(false);
    setError(await responseError(r));
    reload();
  };
  return {
    view,
    error,
    busy,
    run: () => act('/run', { mapId }),
    fixTicket: (runId: string) => act('/fix-ticket', { mapId, runId }),
  };
}
