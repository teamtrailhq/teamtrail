import type { FeedEntry, FeedKind } from '@teamtrail/core';

/** The left bar of an Activity log row: red needs you now, green went well, amber held up or at risk. */
export type FeedEdge = 'urgent' | 'good' | 'attention';

const EDGE: Record<FeedKind, FeedEdge> = {
  'asks-you': 'urgent',
  answered: 'good',
  launched: 'good',
  done: 'good',
  verified: 'good',
  'checks-failed': 'attention',
  stalled: 'attention',
  disconnected: 'attention',
  problem: 'attention',
};

/**
 * Which bar a row gets, or none: from the entry's kind, the one importance cue the log uses. Entries written before
 * kinds existed fall back to their signal: a decision request (signal, alert) needs you, a launch (signal, ok) went well.
 */
export function feedEdge(e: Pick<FeedEntry, 'kind' | 'level' | 'signal'>): FeedEdge | undefined {
  if (e.kind) return EDGE[e.kind];
  if (!e.signal) return undefined;
  if (e.level === 'alert') return 'urgent';
  if (e.level === 'ok') return 'good';
  return undefined;
}
