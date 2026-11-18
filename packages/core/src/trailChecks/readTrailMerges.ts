import { readTicketSync } from '../evidence/syncStore';
import type { TicketMerge } from '../model/trailChecks';
import type { MapSnapshot } from '../model/types';
import { readAttempts } from '../verification/evidenceStore';
import { trailMerges } from './trailMerges';

/** Each done ticket's merge, from its pull request's snapshot (PR sync) and its latest completion. */
export function readTrailMerges(root: string, snap: MapSnapshot): TicketMerge[] {
  return trailMerges({
    tickets: snap.tickets,
    pr: (id) => readTicketSync(root, snap.map.id, id)?.pr,
    attempt: (id) => readAttempts(root, snap.map.id, id).at(-1),
  });
}
