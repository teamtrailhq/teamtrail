import type { MapSnapshot, Ticket } from '@teamtrail/core';
import { useDiscoveryHold } from '../discovery';
import { useModels } from '../models';

/**
 * What holds each ready card back besides its blockers: a stronger model than any connected agent runs (`needs`,
 * model matching), or the discovery brief the trail lead hasn't accepted yet (`briefHeld`).
 */
export function useCardHolds(snap: MapSnapshot) {
  const waits = useModels()?.waiting;
  const briefHolds = useDiscoveryHold(snap);
  return (t: Ticket) => ({
    needs: waits?.find((w) => w.mapId === snap.map.id && w.ticketId === t.id)?.tier,
    briefHeld: briefHolds(t),
  });
}
