import type { NodeState } from '@teamtrail/core';

/**
 * The status dot on a map card: green while an agent works on it, amber when it waits on a person or is held up, grey
 * when it's ready, a grey ring in the backlog, a muted check when done and a faint dot when cancelled.
 */
export type NodeTone = 'working' | 'attention' | 'ready' | 'backlog' | 'done' | 'cancelled';

const BY_STATE: Record<NodeState, NodeTone> = {
  claimed: 'working',
  verifying: 'working',
  frontier: 'ready',
  blocked: 'backlog',
  parked: 'backlog',
  decided: 'done',
  'out-of-scope': 'cancelled',
  rework: 'attention',
  held: 'attention',
};

/**
 * A card's tone. `live`: an agent's session is on it. `attention`: it waits on you, its claim stalled, it waits for a
 * stronger model, or it's ready but needs a person.
 */
export function nodeTone(input: { state: NodeState; live: boolean; attention: boolean }): NodeTone {
  const base = BY_STATE[input.state];
  if (base === 'done' || base === 'cancelled') return base;
  if (input.attention) return 'attention';
  if (input.live) return 'working';
  return base;
}
