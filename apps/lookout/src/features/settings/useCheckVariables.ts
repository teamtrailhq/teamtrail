import type { CheckVariables } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';

type Change = { add: string } | { remove: string };

async function call(init?: RequestInit): Promise<CheckVariables> {
  const res = await fetch(`${apiBase()}/verification/variables`, init);
  const body = (await res.json().catch(() => ({}))) as CheckVariables & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
  return body;
}

/**
 * The variables checks may read on this machine (`GET /verification/variables`): names only, never a value. `view`
 * stays undefined from another device, which the route refuses; `change` adds or removes one name on this machine.
 */
export function useCheckVariables() {
  const [view, setView] = useState<CheckVariables>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    call().then(
      (v) => live && setView(v),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  const change = useCallback(async (body: Change) => {
    setError(undefined);
    try {
      const init = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      setView(await call(init));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, []);
  return { view, error, change };
}
