import type { AttentionView, MapSnapshot, SessionInfo } from '@teamtrail/core';
import { useMemo } from 'react';
import { useCardHolds } from '../features/map';
import { trailCounts, trailSegments } from '../features/trail-bar';
import { isRunning } from '../lib';
import { type LiveTicket, liveTickets } from '../lib/liveTickets';

/**
 * The trail on screen, live: each ticket's tone (lib/liveTickets.ts), what on it needs you (the queue's items on this
 * trail, most urgent first), and the trail bar's segments and counts, read once for the map, the bar and the bubble.
 */
export function useLiveTrail(input: { snap?: MapSnapshot; sessions: SessionInfo[]; view?: AttentionView }) {
  const { snap, sessions, view } = input;
  const holds = useCardHolds(snap);
  const items = useMemo(() => (view?.items ?? []).filter((i) => !!snap && i.mapId === snap.map.id), [view, snap]);
  const running = useMemo(() => sessions.filter(isRunning), [sessions]);
  const heldBack = (t: Parameters<typeof holds>[0]) => {
    const h = holds(t);
    return !!h.needs || h.briefHeld;
  };
  // cheap enough to read on every render, so a model wait or the brief's gate is never stale
  const live = snap ? liveTickets({ snap, sessions: running, items, heldBack }) : new Map<string, LiveTicket>();
  const segments = trailSegments(live);
  const counts = trailCounts(segments, items);
  const keyOf = (id: string) => snap?.tickets.find((t) => t.id === id)?.key;
  return { live, items, segments, counts, keyOf };
}
