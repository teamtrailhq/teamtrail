import type { MapSnapshot } from '@teamtrail/core';
import type { PrSyncSnapshot } from '../../lib';
import type { ProofStatuses } from '../map';

const startOfDay = (now: number) => new Date(new Date(now).toDateString()).getTime();
const prs = (n: number) => `${n} verified ${n === 1 ? 'PR' : 'PRs'}`;

/**
 * The home's closing label line, about today on the trail ("Today · 2 verified · 1 merged"). Behind a server that
 * merges verified pull requests itself (`autoMerged`): how many it merged, and that unverified work waits. Otherwise:
 * how many finished tickets were verified and how many of their pull requests merged.
 */
export function footerText(input: {
  snap: MapSnapshot;
  proofs?: ProofStatuses;
  prs: PrSyncSnapshot;
  /** How many verified PRs the server merged itself today (lib/autoMerge.ts); undefined locally. */
  autoMerged?: number;
  now: number;
}): string[] {
  const from = startOfDay(input.now);
  const today = input.snap.tickets.filter(
    (t) => t.state === 'closed' && t.closeReason === 'completed' && (t.closedAt ?? 0) >= from,
  );
  const verified = today.filter((t) => input.proofs?.[t.id] === 'verified');
  const merged = verified.filter((t) => input.prs.tickets[`${input.snap.map.id}/${t.id}`]?.pr?.state === 'merged');
  if (input.autoMerged !== undefined)
    return ['Today', `${prs(input.autoMerged)} merged automatically`, 'unverified work waits for you'];
  if (!today.length) return ['Today', 'nothing finished yet'];
  return ['Today', `${verified.length} verified`, `${merged.length} merged`];
}
