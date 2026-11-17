import type { MainChecksView, MainChoice } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';
import { responseError } from '../../lib/responseError';

const api = () => `${apiBase()}/main-checks`;

const post = (path: string, body: unknown) =>
  fetch(`${api()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);

/**
 * Checks on main for one trail (`GET /main-checks`), live on the `main-checks` event, with the trail lead's choices
 * (`choose`) and "Run checks on main" (`run`). An action's error shows until the next one.
 */
export function useMainChecks(mapId?: string) {
  const [view, setView] = useState<MainChecksView>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { reload, pushed } = useLiveLoad({
    view: mapId,
    load: async () => {
      if (!mapId) return undefined;
      const r = await fetch(`${api()}?mapId=${encodeURIComponent(mapId)}`);
      return r.ok ? ((await r.json()) as MainChecksView) : undefined;
    },
    show: setView,
    events: { 'main-checks': () => true },
  });
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    const r = await post(path, body);
    setBusy(false);
    const failed = await responseError(r);
    setError(failed);
    if (failed) return reload();
    if (path === '/choose') {
      pushed();
      setView((await r!.json()) as MainChecksView);
    } else reload();
  };
  return {
    view,
    error,
    busy,
    choose: (choice: MainChoice) => act('/choose', { mapId, choice }),
    run: () => act('/run', { mapId }),
  };
}
