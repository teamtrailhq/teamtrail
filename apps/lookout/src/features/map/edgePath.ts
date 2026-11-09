import { type LaidOutNode, type LayoutDirection, NODE_H, NODE_W } from '@teamtrail/core';
import { type Rect, routeEdge } from './routeEdge';

/** The gap between two layers of cards (`planning/derive.ts`: layer spacing less the card): where connectors turn. */
const LAYER_GAP = { LR: 130, TB: 68 };

/**
 * The connector from a blocker to the ticket it blocks: out of the blocker's exit edge, turning in the gap just before
 * the blocked card, into its entry edge. Edges into the same card share that last run, like branches of a tree; a
 * long one keeps clear of the `cards` it passes.
 */
export function edgePath(input: { direction: LayoutDirection; from: LaidOutNode; to: LaidOutNode; cards: Rect[] }) {
  const { direction, from, to, cards } = input;
  if (direction === 'LR') {
    const a = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
    const b = { x: to.x, y: to.y + NODE_H / 2 };
    return routeEdge({ direction, a, b, obstacles: cards, gap: LAYER_GAP.LR });
  }
  const a = { x: from.x + NODE_W / 2, y: from.y + NODE_H };
  const b = { x: to.x + NODE_W / 2, y: to.y };
  return routeEdge({ direction, a, b, obstacles: cards, gap: LAYER_GAP.TB });
}
