import type { ReadinessView } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';
import { responseError } from '../../lib/responseError';
import { trustChanged } from '../../lib/trustChanged';

const api = () => `${apiBase()}/repo/readiness`;

const post = (path: string, body: unknown) =>
  fetch(`${api()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);

/** A fix as the page showed it: the finding and the hash of its fix. */
export interface ShownFix {
  id: string;
  hash: string;
}

/**
 * Repo readiness (`GET /repo/readiness`), live on verification.json and on what this machine approved (a Start
 * anyway is kept there too), with the trail lead's fixes, Start anyway and its undo, and Check again. An action's
 * error shows until the next one; its reply is the view as it is after it.
 */
export function useReadiness() {
  const [view, setView] = useState<ReadinessView>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = async (fresh: boolean) => {
    const r = await fetch(`${api()}${fresh ? '?fresh=1' : ''}`);
    return r.ok ? ((await r.json()) as ReadinessView) : undefined;
  };
  const { reload, pushed } = useLiveLoad({
    load: () => load(false),
    show: setView,
    changed: (p) => p.endsWith('verification.json'),
    events: { trust: (data) => trustChanged(data).approvals },
  });
  const act = async (path: string, body: unknown) => {
    setBusy(true);
    const r = await post(path, body);
    const failed = await responseError(r);
    setBusy(false);
    setError(failed);
    if (failed) return reload();
    pushed();
    setView((await r!.json()) as ReadinessView);
  };
  const checkAgain = async () => {
    setBusy(true);
    const fresh = await load(true).catch(() => undefined);
    setBusy(false);
    pushed();
    if (fresh) setView(fresh);
  };
  return {
    view,
    error,
    busy,
    checkAgain,
    fix: (fixes: ShownFix[], acknowledged: boolean) => act('/fix', { fixes, base: view?.readiness.base, acknowledged }),
    startAnyway: (mapId: string, undo = false) => act('/start-anyway', { mapId, undo }),
  };
}
