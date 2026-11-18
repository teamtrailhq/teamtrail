import type { PullRequestSnapshot, TicketSync } from '@teamtrail/core';
import type { MetaPart } from '../../components/ui';
import { syncedAgo } from '../../lib';

/** The pull request as its block shows it: state chip, number and title, the link, and one context line. */
export interface PrBlock {
  number: number;
  /** Untrusted (anyone who opens a PR writes it): only ever rendered as plain text. */
  title?: string;
  /** Not yet checked as a web URL: the block passes it through `webUrl`. */
  url?: string;
  state: PrBlockState;
  parts: MetaPart[];
}

export type PrBlockState = 'open' | 'draft' | 'merged' | 'closed' | 'unread';

export const PR_STATE_TEXT: Record<PrBlockState, string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
  unread: 'Not read yet',
};

const CHECKS: Partial<Record<TicketSync['checksSummary'], string>> = {
  passed: 'checks passing',
  failing: 'checks failing',
  pending: 'checks pending',
  unknown: 'checks unknown',
};

/**
 * A ticket's pull request from PR sync, for the block under its state line; none when it has none. `proofHead` is
 * the commit its proof covers: a PR merged (or open) at another commit is said plainly, since the proof doesn't cover
 * what was merged then. An open PR also says what its reviews and GitHub's merge check say. `lastOkAt` is the PR
 * sync's last good tick (PrSyncStatus): a snapshot is rewritten only when it changes, so that is how fresh it is.
 */
export function prBlock(
  sync: TicketSync | undefined,
  proofHead?: string | null,
  lastOkAt?: number,
): PrBlock | undefined {
  if (!sync) return undefined;
  const pr = sync.pr;
  if (!pr) return { number: sync.link.number, state: 'unread', parts: [syncPart(sync, lastOkAt)] };
  const parts: MetaPart[] = [
    pr.state === 'closed' ? undefined : CHECKS[sync.checksSummary],
    ...(pr.state === 'open' ? openParts(pr) : []),
    proofPart(pr, proofHead),
    syncPart(sync, lastOkAt),
  ].filter((p): p is MetaPart => !!p);
  return { number: pr.number, title: pr.title, url: pr.url, state: stateOf(pr), parts };
}

function stateOf(pr: PullRequestSnapshot): PrBlockState {
  if (pr.state === 'open' && pr.draft) return 'draft';
  return pr.state;
}

/** Whether the PR's head is the commit the proof covers; nothing without a proof, or for a PR closed unmerged. */
function proofPart(pr: PullRequestSnapshot, proofHead?: string | null): MetaPart | undefined {
  if (!proofHead || !pr.headSha || pr.state === 'closed') return undefined;
  const same = pr.headSha === proofHead;
  if (pr.state === 'merged')
    return same
      ? 'merged at the commit its proof covers'
      : { text: 'merged at a newer commit than its proof covers', strong: true };
  return same ? 'at the commit its proof covers' : { text: 'newer commits than its proof covers', strong: true };
}

/** What stands in an open PR's way besides its checks: changes requested, conflicts; or that it was approved. */
function openParts(pr: PullRequestSnapshot): MetaPart[] {
  const parts: MetaPart[] = [];
  if (pr.review === 'changes_requested') parts.push({ text: 'changes requested', strong: true });
  if (pr.review === 'approved') parts.push('approved');
  if (pr.mergeable === 'conflicting') parts.push({ text: 'merge conflicts', strong: true });
  return parts;
}

function syncPart(sync: TicketSync, lastOkAt?: number): string {
  if (sync.error) return 'sync failed';
  if (sync.syncedAt) return `synced ${syncedAgo(Math.max(sync.syncedAt, lastOkAt ?? 0))}`;
  return 'not synced yet';
}
