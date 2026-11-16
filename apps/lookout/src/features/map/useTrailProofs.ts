import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

/** Each done ticket's proof: verified or not. */
export type ProofStatuses = Record<string, 'verified' | 'not-verified'>;

/**
 * Whether each done ticket of the trail is verified (`GET /proof/trail`), for the map's checks and whether the trail
 * is done: loaded with the trail, again when its tickets move (`version`) and whenever a completion's evidence lands.
 * `undefined` until this trail's first answer, so another trail's statuses never stand in for it.
 */
export function useTrailProofs(mapId: string | undefined, version: unknown): ProofStatuses | undefined {
  const [loaded, setLoaded] = useState<{ mapId?: string; statuses: ProofStatuses }>({ statuses: {} });
  useLiveLoad({
    view: mapId,
    version,
    load: async () => {
      if (!mapId) return { mapId, statuses: {} };
      const r = await fetch(`${apiBase()}/proof/trail?mapId=${encodeURIComponent(mapId)}`);
      const statuses = r.ok ? (((await r.json()) as { statuses?: ProofStatuses }).statuses ?? {}) : {};
      return { mapId, statuses };
    },
    show: setLoaded,
    failed: () => setLoaded({ mapId, statuses: {} }),
    changed: (p) => p.includes('.evidence') || (!!mapId && p.includes(mapId)),
  });
  return mapId && loaded.mapId === mapId ? loaded.statuses : undefined;
}
