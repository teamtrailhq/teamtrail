import type { MapSnapshot, Ticket } from '@teamtrail/core';
import { discoveryHolds } from './discoveryHolds';
import { useBrief } from './useBrief';

/** Whether the discovery gate holds each of the trail's tickets until the trail lead accepts the brief. */
export function useDiscoveryHold(snap?: MapSnapshot) {
  const { gated } = useBrief(snap);
  return (t: Pick<Ticket, 'state' | 'type'>) => discoveryHolds(gated, t);
}
