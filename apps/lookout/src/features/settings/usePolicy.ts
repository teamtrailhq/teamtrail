import { type RiskPolicy } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerChange } from '../../lib/trackerChanges';

export interface PolicyView {
  policy: RiskPolicy;
  errors: string[];
  /** No usable `policy.json`: the built-in defaults apply. */
  defaults: boolean;
}

const url = `${apiBase()}/policy`;

async function fetchPolicy(): Promise<PolicyView | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  return (await r.json()) as PolicyView;
}

/**
 * The project's risk policy as the local server reads it, kept fresh when `policy.json` changes.
 * undefined while loading, null without a server (static build). `save` resolves to an error message, if any.
 */
export function usePolicy() {
  const [view, setView] = useState<PolicyView | null>();
  const load = useCallback(() => {
    fetchPolicy().then(setView, () => setView(null));
  }, []);
  useEffect(() => {
    load();
    return onTrackerChange((p) => {
      if (p.endsWith('policy.json')) load();
    });
  }, [load]);
  const save = useCallback(async (policy: RiskPolicy): Promise<string | undefined> => {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(policy),
    });
    const body = (await r.json()) as PolicyView & { error?: string };
    if (!r.ok) return body.error ?? `Saving failed (${r.status})`;
    setView(body);
    return undefined;
  }, []);
  return { view, save };
}
