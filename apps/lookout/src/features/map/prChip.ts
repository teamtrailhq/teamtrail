import type { TicketSync } from '@teamtrail/core';

/** A card's pull request chip, `PR #12 merged`; none until PR sync has read the PR. */
export function prChip(sync: TicketSync | undefined): string | undefined {
  const pr = sync?.pr;
  if (!pr) return undefined;
  const state = pr.state === 'open' && pr.draft ? 'draft' : pr.state;
  return `PR #${pr.number} ${state}`;
}
