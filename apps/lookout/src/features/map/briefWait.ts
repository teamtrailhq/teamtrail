import type { LaidOutNode } from '@teamtrail/core';

/** A ready card the discovery gate holds: no agent can claim it, so it isn't "ready for an agent". */
export function briefWait(n: LaidOutNode, held: boolean | undefined, live: boolean): boolean {
  return !!held && n.state === 'frontier' && !live;
}
