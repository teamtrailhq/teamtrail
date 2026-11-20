import type { CheckVariables } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';

type Change = { add: string; acknowledged?: boolean } | { remove: string };

/** A name that reads like a credential, held until the person acknowledges what checks reading it means. */
export interface PendingSecret {
  name: string;
  note: string;
}

class NeedsAcknowledgement extends Error {}

async function call(init?: RequestInit): Promise<CheckVariables> {
  const res = await fetch(`${apiBase()}/verification/variables`, init);
  const body = (await res.json().catch(() => ({}))) as CheckVariables & { error?: string; acknowledge?: boolean };
  if (res.status === 409 && body.acknowledge) throw new NeedsAcknowledgement(body.error ?? '');
  if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
  return body;
}

/**
 * The variables checks may read on this machine (`GET /verification/variables`): names only, never a value. `view`
 * stays undefined from another device, which the route refuses; `change` adds or removes one name on this machine. A
 * name that reads like a credential comes back as `pending` until it is added again with `acknowledged`.
 */
export function useCheckVariables() {
  const [view, setView] = useState<CheckVariables>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<PendingSecret>();
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
    setPending(undefined);
    try {
      const init = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      setView(await call(init));
      return true;
    } catch (e) {
      if (e instanceof NeedsAcknowledgement && 'add' in body) setPending({ name: body.add, note: e.message });
      else setError((e as Error).message);
      return false;
    }
  }, []);
  return { view, error, pending, change, cancel: () => setPending(undefined) };
}
