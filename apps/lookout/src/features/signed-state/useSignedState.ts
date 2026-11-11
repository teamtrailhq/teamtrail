import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

type Item = { mapId: string; kind: 'map' | 'ticket' | 'decision'; id: string };

/** `GET /signed-state`: trail files changed outside Teamtrail on this machine, by field, and text-only edits. */
export interface SignedStateView {
  problems: string[];
  changes: (Item & { fields: string[] })[];
  textEdits: Item[];
}

async function fetchSignedState(): Promise<SignedStateView | null> {
  const r = await fetch(`${apiBase()}/signed-state`);
  return r.ok ? ((await r.json()) as SignedStateView) : null;
}

/**
 * What changed outside Teamtrail, as the server judges it against this machine's signed record. Refetched when a
 * trail's file changes. undefined while loading, null without a server.
 */
export function useSignedState() {
  const [view, setView] = useState<SignedStateView | null>();
  useLiveLoad({
    load: fetchSignedState,
    show: setView,
    failed: () => setView(null),
    changed: (p) => p.endsWith('map.md') || p.includes('/tickets/') || p.includes('/decisions/'),
  });
  return view;
}
