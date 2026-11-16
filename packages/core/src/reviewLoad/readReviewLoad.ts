import { readAttentionPolicy } from '../attention/attentionStore';
import { readTicketSyncs } from '../evidence/syncStore';
import type { ReviewLoad } from '../model/reviewLoad';
import type { MapSnapshot } from '../model/types';
import { approvalItems } from '../verification/approvals';
import { reviewLoad } from './reviewLoad';

/**
 * The project's review queue, read from the tracker folder: approvals on every trail (archived ones too: what waits
 * on the human still waits), done tickets whose pull request is open, and the team's limit from attention.json.
 */
export function readReviewLoad(root: string, snaps: MapSnapshot[]): ReviewLoad {
  return reviewLoad({
    approvals: snaps.flatMap((s) => approvalItems(root, s)),
    syncs: readTicketSyncs(root),
    limit: readAttentionPolicy(root).value.reviewLimit,
  });
}
