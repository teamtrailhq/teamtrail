import { useCallback, useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

const url = () => `${apiBase()}/proof/settings`;

async function fetchSettings(): Promise<{ enabled: boolean } | null> {
  const r = await fetch(url());
  return r.ok ? ((await r.json()) as { enabled: boolean }) : null;
}

/**
 * Whether this machine posts proofs to pull requests. undefined while loading, null without a server. `set` resolves
 * to an error message, if any (another device can't change it).
 */
export function useProofSettings() {
  const [enabled, setEnabled] = useState<boolean | null>();
  const { pushed } = useLiveLoad({
    load: fetchSettings,
    show: (v) => setEnabled(v?.enabled ?? null),
    failed: () => setEnabled(null),
    events: { proof: () => true },
  });
  const set = useCallback(
    async (on: boolean): Promise<string | undefined> => {
      const r = await fetch(url(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: on }),
      });
      const body = (await r.json()) as { enabled?: boolean; error?: string };
      if (!r.ok) return body.error ?? `Saving failed (${r.status})`;
      pushed();
      setEnabled(body.enabled === true);
      return undefined;
    },
    [pushed],
  );
  return { enabled, set };
}
