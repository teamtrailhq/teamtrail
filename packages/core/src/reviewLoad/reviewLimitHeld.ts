import { DISCOVERY_TYPES } from '../discovery/brief';
import type { ReviewLoad } from '../model/reviewLoad';
import type { MapSnapshot, Ticket } from '../model/types';
import { frontier } from '../planning/derive';

/**
 * The ready tickets the review limit holds back: new implementation work, while the review queue is full. Rework
 * finishes work already waiting, and research, junction and review tickets add no code to review, so they go on.
 */
export function reviewLimitHeld(snap: MapSnapshot, load: Pick<ReviewLoad, 'full'>): Ticket[] {
  if (!load.full) return [];
  return frontier(snap.tickets, snap.map.mode).filter((t) => !DISCOVERY_TYPES.includes(t.type));
}
