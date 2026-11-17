import { DISCOVERY_TYPES } from '../discovery/brief';
import type { MainChecksView } from '../model/mainChecks';
import type { MapSnapshot, Ticket } from '../model/types';
import { frontier } from '../planning/derive';

/**
 * The ready tickets checks on main hold back: new implementation work, while they hold (mainChecksState.ts).
 * Research, junction and review tickets add no code that a check would judge, so they go on.
 */
export function mainChecksHeld(snap: MapSnapshot, view: Pick<MainChecksView, 'holds'>): Ticket[] {
  if (!view.holds) return [];
  return frontier(snap.tickets, snap.map.mode).filter((t) => !DISCOVERY_TYPES.includes(t.type));
}
