import { type LaidOutNode, type LayoutDirection, NODE_H, NODE_W } from '@teamtrail/core';
import { cardRects } from './cardRects';
import { routeEdge } from './routeEdge';

/** The `main` marker's size, and the room it takes before the trail's first tickets. */
export const MAIN_W = 62;
export const MAIN_H = 26;
const ROOM = { LR: { x: 130, y: 0 }, TB: { x: 0, y: 84 } };

/** How far the trail moves over to make room for the marker: none when checks on main are off. */
export function mainRoom(direction: LayoutDirection, shown: boolean) {
  return shown ? ROOM[direction] : { x: 0, y: 0 };
}

/**
 * Where `main` sits, in the trail's coordinates (left of or above its first tickets), and the thin connectors from it
 * to every ticket that waits on no other: the trail starts from the default branch.
 */
export function mainSpot(input: { direction: LayoutDirection; nodes: LaidOutNode[]; graphH: number; width: number }) {
  const { direction, nodes } = input;
  const first = nodes.filter(
    (n) => n.state !== 'out-of-scope' && !n.ticket.blockedBy.some((b) => nodes.some((m) => m.ticket.id === b)),
  );
  const cards = cardRects(nodes);
  if (direction === 'LR') {
    const x = -ROOM.LR.x + 20;
    const y = input.graphH / 2 - MAIN_H / 2;
    const a = { x: x + MAIN_W, y: y + MAIN_H / 2 };
    const edges = first.map((n) =>
      routeEdge({ direction, a, b: { x: n.x, y: n.y + NODE_H / 2 }, obstacles: cards, gap: 96 }),
    );
    return { x, y, edges };
  }
  const x = input.width / 2 - MAIN_W / 2;
  const y = -ROOM.TB.y + 16;
  const a = { x: x + MAIN_W / 2, y: y + MAIN_H };
  const edges = first.map((n) =>
    routeEdge({ direction, a, b: { x: n.x + NODE_W / 2, y: n.y }, obstacles: cards, gap: 48 }),
  );
  return { x, y, edges };
}
