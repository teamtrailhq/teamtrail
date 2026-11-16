import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

/** Each done ticket's proof: verified or not. */
export type ProofStatuses = Record<string, 'verified' | 'not-verified'>;

/**
 * Whether each done ticket of the trail is verified (`GET /proof/trail`), for the map's checks: loaded with the trail,
 * again when its tickets move (`version`) and whenever a completion's evidence lands.
 */
export function useTrailProofs(mapId: string, version: unknown) {
  const [statuses, setStatuses] = useState<ProofStatuses>({});
  useLiveLoad({
    view: mapId,
    version,
    load: async () => {
      const r = await fetch(`${apiBase()}/proof/trail?mapId=${encodeURIComponent(mapId)}`);
      return r.ok ? (((await r.json()) as { statuses?: ProofStatuses }).statuses ?? {}) : {};
    },
    show: setStatuses,
    failed: () => setStatuses({}),
    changed: (p) => p.includes('.evidence') || p.includes(mapId),
  });
  return statuses;
}
