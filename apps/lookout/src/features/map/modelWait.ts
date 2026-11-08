import type { LaidOutNode, ModelTier } from '@teamtrail/core';

/** Model matching: the tier a ready ticket waits for, when nobody holds it and no session is on it. */
export function modelWait(n: LaidOutNode, needs: ModelTier | undefined, live: boolean): ModelTier | undefined {
  const ready = n.state === 'frontier' || n.state === 'rework';
  if (!needs || live || n.ticket.assignee || !ready) return undefined;
  return needs;
}
