import type { PullRequestSnapshot } from '../model/prEvidence';

const STATE_RANK: Record<PullRequestSnapshot['state'], number> = { open: 2, merged: 1, closed: 0 };

/**
 * Which of two pull requests for the same ticket is its PR: one still open, else one merged, over one closed without
 * merging; then the newer (higher number). A replacement opened on the same branch, or with the same marker, after
 * the first was closed wins.
 */
export const preferredPr = (a: PullRequestSnapshot, b: PullRequestSnapshot) =>
  STATE_RANK[a.state] - STATE_RANK[b.state] || a.number - b.number;

/** The preferred of `prs`, or undefined when there are none. */
export const bestPr = <T extends PullRequestSnapshot>(prs: T[]): T | undefined =>
  prs.reduce<T | undefined>((best, p) => (!best || preferredPr(p, best) > 0 ? p : best), undefined);
