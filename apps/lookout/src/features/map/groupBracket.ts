import type { LayoutDirection, LayoutGroup } from '@teamtrail/core';
import { orthoPath } from './orthoPath';

/** How far the bracket stands off the group's cards, and how far its ends reach toward them. */
const OFF = 16;
const TICK = 8;

/**
 * The bracket along one side of a wrapped layer (`before` it on the trail, or `after`): one connector reaches the
 * whole group there instead of one per card, so none has to thread between its cards. `at` is where it joins.
 */
export function groupBracket(input: { direction: LayoutDirection; group: LayoutGroup; side: 'before' | 'after' }) {
  const { group: g, side } = input;
  const flip = input.direction === 'TB';
  // laid left to right: `x` along the trail, `y` across it
  const box = flip ? { x: g.y, y: g.x, w: g.h, h: g.w } : g;
  const x = side === 'before' ? box.x - OFF : box.x + box.w + OFF;
  const tip = side === 'before' ? x + TICK : x - TICK;
  const swap = (p: { x: number; y: number }) => (flip ? { x: p.y, y: p.x } : p);
  const points = [
    { x: tip, y: box.y },
    { x, y: box.y },
    { x, y: box.y + box.h },
    { x: tip, y: box.y + box.h },
  ].map(swap);
  return { d: orthoPath(points), at: swap({ x, y: box.y + box.h / 2 }) };
}
