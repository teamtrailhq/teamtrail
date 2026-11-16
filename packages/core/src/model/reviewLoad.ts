/**
 * The review limit: how much finished work may wait on a person before agents stop starting new work. Writing code
 * got cheap; reviewing it did not, so the review queue is where agent work piles up (Little's law: the wait grows with
 * the queue). The limit is the team's, `reviewLimit` in attention.json; unset means off.
 */

/** Where a finished ticket waits: the trail lead's approval in the Lookout, or its pull request on the code host. */
export type ReviewWait = 'approval' | 'pull-request';

/** One finished ticket waiting on a person to review it. */
export interface WaitingReview {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  via: ReviewWait;
  /** When it started waiting (epoch ms). */
  since: number;
}

/** The project's review queue against the team's limit. */
export interface ReviewLoad {
  /** The team's limit; missing means off. */
  limit?: number;
  /** Oldest first. */
  waiting: WaitingReview[];
  /** At or over the limit: agents start no new implementation work. */
  full: boolean;
}

/** The review limit a team may set, inclusive. */
export const REVIEW_LIMIT_RANGE = { min: 1, max: 50 } as const;
