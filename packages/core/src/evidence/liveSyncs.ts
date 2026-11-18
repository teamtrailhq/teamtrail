import type { PrSyncStatus, TicketSync } from '../model/prEvidence';
import type { MapSnapshot } from '../model/types';
import { readSyncStatus, readTicketSyncs } from './syncStore';

/** How long past its next tick the PR sync may be before what it last read counts as unknown. */
const GRACE_MS = 5 * 60_000;

/**
 * The PR sync stopped: it was switched off (no token, no repo, sync off), or its next tick is long overdue (no
 * Lookout running to make it). A project whose sync never ran says nothing either way.
 */
export function prSyncStale(status: PrSyncStatus, now: number): boolean {
  if (status.nextAt === undefined) return false;
  return status.state === 'off' || now > status.nextAt + GRACE_MS;
}

/**
 * The PR snapshots that still say something true: only tickets that exist in `snaps` (a deleted ticket's or trail's
 * snapshot never counts), and none while the PR sync is stopped (prSyncStale), since nothing keeps them current then.
 * The review queue, the attention queue and project summaries all read PR state through this.
 */
export function liveSyncs(o: { root: string; snaps: MapSnapshot[]; now: number }): TicketSync[] {
  if (prSyncStale(readSyncStatus(o.root), o.now)) return [];
  const known = new Set(o.snaps.flatMap((s) => s.tickets.map((t) => `${s.map.id}/${t.id}`)));
  return readTicketSyncs(o.root).filter((s) => known.has(`${s.mapId}/${s.ticketId}`));
}
