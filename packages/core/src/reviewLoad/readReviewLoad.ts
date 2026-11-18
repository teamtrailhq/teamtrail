import { readAttentionPolicy } from '../attention/attentionStore';
import { liveSyncs } from '../evidence/liveSyncs';
import type { ReviewLoad } from '../model/reviewLoad';
import type { MapSnapshot } from '../model/types';
import { approvalItems } from '../verification/approvals';
import { reviewLoad } from './reviewLoad';

/**
 * The project's review queue, read from the tracker folder: approvals on every trail (archived ones too: what waits
 * on the human still waits), done tickets whose pull request is open, and the team's limit from attention.json.
 * Pull requests count only as the PR sync still keeps them (liveSyncs): never a deleted ticket's, and none while the
 * sync is stopped, since an unknown PR state must not hold agents' work back.
 */
export function readReviewLoad(root: string, snaps: MapSnapshot[], now = Date.now()): ReviewLoad {
  return reviewLoad({
    approvals: snaps.flatMap((s) => approvalItems(root, s)),
    syncs: liveSyncs({ root, snaps, now }),
    limit: readAttentionPolicy(root).value.reviewLimit,
  });
}
