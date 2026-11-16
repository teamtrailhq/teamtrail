import type { MapSnapshot } from '@teamtrail/core';
import { type PrSyncSnapshot, prSync } from '../../lib/prSync';

/** The trail's done tickets whose pull request is still open, in ticket order: what's left to merge. */
export function openPullRequests(sync: PrSyncSnapshot, snap: MapSnapshot): string[] {
  const done = snap.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed');
  return done
    .filter((t) => prSync.ticket(sync, snap.map.id, t.id)?.flags.some((f) => f.kind === 'done-pr-open'))
    .map((t) => t.id);
}
