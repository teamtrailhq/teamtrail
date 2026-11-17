import type { AttentionView, MapSnapshot, SessionInfo } from '@teamtrail/core';
import { useMemo } from 'react';
import { useCardHolds } from '../features/map';
import { trailCounts, trailSegments } from '../features/trail-bar';
import { isRunning } from '../lib';
import { type LiveTicket, liveTickets } from '../lib/liveTickets';

/**
 * The trail on screen, live: each ticket's tone (lib/liveTickets.ts), what needs you here (the queue's items on this
 * trail and the project's own, most urgent first; `elsewhere` the other trails'), the tickets the map opens on, and the trail bar's segments and counts, read once for the map, the bar and the bubble.
 */
export function useLiveTrail(input: { snap?: MapSnapshot; sessions: SessionInfo[]; view?: AttentionView }) {
  const { snap, sessions, view } = input;
  const holds = useCardHolds(snap);
  // this trail's, and the project's own (approvals on this machine, guides, the field guide): what needs you here
  const mapId = snap?.map.id;
  const [items, elsewhere] = useMemo(() => {
    const all = view?.items ?? [];
    const here = (i: { mapId: string }) => !i.mapId || i.mapId === mapId;
    return [all.filter(here), all.filter((i) => !here(i))];
  }, [view, mapId]);
  const focus = useMemo(() => [...new Set(items.flatMap((i) => (i.ticketId ? [i.ticketId] : [])))], [items]);
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
  return { live, items, elsewhere, focus, segments, counts, keyOf };
}
