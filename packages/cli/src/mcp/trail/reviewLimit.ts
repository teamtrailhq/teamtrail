import {
  OperationError,
  reviewLimitHeld,
  reviewLimitReason,
  type MapSnapshot,
  type ReviewLoad,
  type Ticket,
} from '@teamtrail/core';
import { readAttentionPolicy, readReviewLoad } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/** The review limit on one trail: the project's review queue, and the ready tickets it holds back. */
export interface ReviewGate {
  load?: ReviewLoad;
  held: Ticket[];
  /** Why new implementation work waits; missing while the queue is under the limit. */
  reason?: string;
}

/**
 * The team's review limit for `snap`. The queue spans every trail (one human reviews them all), so it reads them all,
 * and only when attention.json sets a limit: with it off, nothing is read and nothing is held.
 */
export async function reviewGate(ctx: AgentContext, snap: MapSnapshot): Promise<ReviewGate> {
  if (!readAttentionPolicy(ctx.root).value.reviewLimit) return { held: [] };
  const maps = await ctx.adapter.listMaps();
  const snaps = await Promise.all(maps.map((m) => (m.id === snap.map.id ? snap : ctx.load(m.id))));
  const load = readReviewLoad(ctx.root, snaps);
  return { load, held: reviewLimitHeld(snap, load), reason: reviewLimitReason(load) };
}

/** Refuses an explicit claim of new implementation work while the review queue is full. Rework and own claims go on. */
export function assertUnderReviewLimit(gate: ReviewGate, t: Ticket, agent: string) {
  if (t.assignee === agent || !gate.reason) return;
  if (gate.held.some((h) => h.id === t.id)) throw new OperationError(gate.reason);
}

/** `reviewLimit` on next and claim results while the queue is full, so the agent can tell the human. */
export const reviewLimitField = (gate: ReviewGate) => (gate.reason ? { reviewLimit: gate.reason } : {});
