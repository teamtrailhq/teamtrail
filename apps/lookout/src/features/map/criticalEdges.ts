import { type MapSnapshot, type Ticket, criticalPath } from '@teamtrail/core';
import { edgeKey } from './mapPreview';

/** The blocking edges along the trail's critical path (the longest chain of open tickets), as `edgeKey`s. */
export function criticalEdges(snap: MapSnapshot, tickets: Ticket[]): Set<string> {
  const chain = criticalPath({ ...snap, tickets });
  const keys = new Set<string>();
  for (let i = 1; i < chain.length; i++) keys.add(edgeKey(chain[i - 1].id, chain[i].id));
  return keys;
}
