import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerChange } from '../../lib/trackerChanges';

type Item = { mapId: string; kind: 'map' | 'ticket' | 'decision'; id: string };

/** `GET /signed-state`: trail files changed outside Teamtrail on this machine, by field, and text-only edits. */
export interface SignedStateView {
  problems: string[];
  changes: (Item & { fields: string[] })[];
  textEdits: Item[];
}

/**
 * What changed outside Teamtrail, as the server judges it against this machine's signed record. Refetched when a
 * trail's file changes. undefined while loading, null without a server.
 */
export function useSignedState() {
  const [view, setView] = useState<SignedStateView | null>();
  const load = useCallback(() => {
    fetch(`${apiBase()}/signed-state`)
      .then((r) => (r.ok ? (r.json() as Promise<SignedStateView>) : null))
      .then(setView, () => setView(null));
  }, []);
  useEffect(() => {
    load();
    return onTrackerChange((p) => {
      if (p.endsWith('map.md') || p.includes('/tickets/') || p.includes('/decisions/')) load();
    });
  }, [load]);
  return view;
}
