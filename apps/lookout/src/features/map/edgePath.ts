import { type LaidOutNode, LAYOUT_SPACING, type LayoutDirection, NODE_H, NODE_W } from '@teamtrail/core';
import { nodeGaps } from './nodeGaps';
import { type Rect, routeEdge } from './routeEdge';

/**
 * The connector from a blocker to the ticket it blocks: out of the blocker's exit edge, turning in the gap just before
 * the blocked card, into its entry edge. Edges into the same card share that last run, like branches of a tree; a
 * long one keeps clear of the `cards` it passes, along the gaps between them (inside a wrapped layer too).
 */
export function edgePath(input: { direction: LayoutDirection; from: LaidOutNode; to: LaidOutNode; cards: Rect[] }) {
  const { direction, from, to, cards } = input;
  const s = LAYOUT_SPACING[direction];
  const outer = s.layer - s.along;
  const gap = nodeGaps({ direction, node: from, outer }).after;
  const gapIn = nodeGaps({ direction, node: to, outer }).before;
  if (direction === 'LR') {
    const a = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
    const b = { x: to.x, y: to.y + NODE_H / 2 };
    return routeEdge({ direction, a, b, obstacles: cards, gap, gapIn });
  }
  const a = { x: from.x + NODE_W / 2, y: from.y + NODE_H };
  const b = { x: to.x + NODE_W / 2, y: to.y };
  return routeEdge({ direction, a, b, obstacles: cards, gap, gapIn });
}
