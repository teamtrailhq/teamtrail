import { BRAND, type ModelsView } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { onServerEvent, onTrackerChange } from '../../lib/trackerChanges';

const url = `${BRAND.apiPrefix}/models`;

/**
 * Model matching as the server sees it (`GET /models`): the project's models.json, the agents connected now with
 * their tiers, and the ready tickets waiting for a stronger model. Refetched when a trail, a ticket or models.json changes, and
 * when the attention queue moves (agents connecting and leaving move it). undefined while loading, null without a server.
 */
export function useModels() {
  const [view, setView] = useState<ModelsView | null>();
  const load = useCallback(() => {
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<ModelsView>) : null))
      .then(setView, () => setView(null));
  }, []);
  useEffect(() => {
    load();
    const offTracker = onTrackerChange((p) => {
      if (p.endsWith('models.json') || p.endsWith('map.md') || p.includes('/tickets/')) load();
    });
    const offAttention = onServerEvent('attention', load);
    return () => {
      offTracker();
      offAttention();
    };
  }, [load]);
  return view;
}
