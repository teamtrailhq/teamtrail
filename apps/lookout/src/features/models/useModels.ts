import { BRAND, type ModelsView } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';

const url = `${BRAND.apiPrefix}/models`;

async function fetchModels(): Promise<ModelsView | null> {
  const r = await fetch(url);
  return r.ok ? ((await r.json()) as ModelsView) : null;
}

/**
 * Model matching as the server sees it (`GET /models`): the project's models.json, the agents connected now with
 * their tiers, and the ready tickets waiting for a stronger model. Refetched when a trail, a ticket or models.json changes, and
 * when the attention queue moves (agents connecting and leaving move it). undefined while loading, null without a server.
 */
export function useModels() {
  const [view, setView] = useState<ModelsView | null>();
  useLiveLoad({
    load: fetchModels,
    show: setView,
    failed: () => setView(null),
    changed: (p) => p.endsWith('models.json') || p.endsWith('map.md') || p.includes('/tickets/'),
    events: { attention: () => true },
  });
  return view;
}
