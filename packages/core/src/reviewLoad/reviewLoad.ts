import type { TicketSync } from '../model/prEvidence';
import type { ReviewLoad, WaitingReview } from '../model/reviewLoad';
import type { ApprovalItem } from '../verification/approvals';

export interface ReviewLoadInput {
  /** Tickets waiting on the trail lead (verification/approvals.ts); only `approve` items are finished work. */
  approvals: Pick<ApprovalItem, 'kind' | 'mapId' | 'ticketId' | 'ticketKey' | 'at'>[];
  /** PR sync snapshots; a `done-pr-open` flag is a done ticket whose pull request still waits for review. */
  syncs: Pick<TicketSync, 'mapId' | 'ticketId' | 'ticketKey' | 'flags'>[];
  /** The team's `reviewLimit`; missing means off. */
  limit?: number;
}

const keyOf = (w: Pick<WaitingReview, 'mapId' | 'ticketId'>) => `${w.mapId}#${w.ticketId}`;

/**
 * Finished work waiting on a person, oldest first, against the team's limit. Pure: the same approvals and PR
 * snapshots always give the same queue. A ticket counts once, as an approval while Teamtrail holds it, else as
 * its open pull request.
 */
export function reviewLoad(input: ReviewLoadInput): ReviewLoad {
  const byKey = new Map<string, WaitingReview>();
  for (const a of input.approvals) {
    if (a.kind !== 'approve') continue;
    const w: WaitingReview = {
      mapId: a.mapId,
      ticketId: a.ticketId,
      ticketKey: a.ticketKey,
      via: 'approval',
      since: a.at,
    };
    byKey.set(keyOf(w), w);
  }
  for (const s of input.syncs) {
    const flag = s.flags.find((f) => f.kind === 'done-pr-open');
    if (!flag || byKey.has(keyOf(s))) continue;
    byKey.set(keyOf(s), {
      mapId: s.mapId,
      ticketId: s.ticketId,
      ticketKey: s.ticketKey,
      via: 'pull-request',
      since: flag.since,
    });
  }
  const waiting = [...byKey.values()].sort((a, b) => a.since - b.since || keyOf(a).localeCompare(keyOf(b)));
  const limit = input.limit;
  return { ...(limit ? { limit } : {}), waiting, full: !!limit && waiting.length >= limit };
}
