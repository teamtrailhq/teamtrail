import { BRAND, type SignInView } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { forgetSession } from '../../lib/session';

export interface SignInsView {
  sessions: SignInView[];
  /** Where other devices reach this Lookout; none when it listens on this machine only. */
  lan: string[];
}

/** A code for another device, while it is shown. */
export interface DeviceCode {
  code: string;
  expiresAt: number;
  links: string[];
}

/** The Lookout's own sign-in routes: one list for every project it shows. */
const url = `${BRAND.apiPrefix}/sign-in`;

async function post<T>(path: string, body: unknown = {}): Promise<{ ok: boolean; reply: T & { error?: string } }> {
  const r = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, reply: (await r.json().catch(() => ({}))) as T & { error?: string } };
}

/**
 * Settings → You → Browsers & devices: the paired browsers, a code for another device, Revoke and Sign out.
 * undefined while loading, null without a server, `elsewhere` on a device (the list is managed on the machine).
 */
export function useSignIns() {
  const [view, setView] = useState<SignInsView | 'elsewhere' | null>();
  const [device, setDevice] = useState<DeviceCode>();
  const load = useCallback(() => {
    fetch(`${url}/sessions`)
      .then(async (r) => {
        if (r.ok) return (await r.json()) as SignInsView;
        const refused = (await r.json().catch(() => ({}))) as { elsewhere?: boolean };
        return refused.elsewhere ? 'elsewhere' : null;
      })
      .then(setView, () => setView(null));
  }, []);
  useEffect(load, [load]);
  const pairDevice = useCallback(async () => {
    const { ok, reply } = await post<DeviceCode>('/codes');
    if (!ok) return reply.error ?? 'No code could be made.';
    setDevice(reply);
    return undefined;
  }, []);
  const revoke = useCallback(
    async (id: string) => {
      const { ok, reply } = await post<{ sessions?: SignInView[] }>('/revoke', { id });
      load();
      return ok ? undefined : (reply.error ?? 'That browser could not be revoked.');
    },
    [load],
  );
  const signOut = useCallback(async () => {
    await post('/sign-out');
    forgetSession();
    location.reload();
  }, []);
  return { view, device, closeDevice: () => (setDevice(undefined), load()), pairDevice, revoke, signOut };
}
