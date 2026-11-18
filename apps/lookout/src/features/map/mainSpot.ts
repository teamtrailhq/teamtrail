import { type LaidOutNode, type LayoutDirection, type LayoutGroup, NODE_H, NODE_W } from '@teamtrail/core';
import { bracketedGroups } from './bracketedGroups';
import { cardRects } from './cardRects';
import { groupBracket } from './groupBracket';
import { lineAcross } from './lineAcross';
import { nodeGaps } from './nodeGaps';
import { routeEdge } from './routeEdge';

/** The `main` marker's size, and the room it takes before the trail's first tickets. */
export const MAIN_W = 62;
export const MAIN_H = 26;
const ROOM = { LR: { x: 130, y: 0 }, TB: { x: 0, y: 84 } };
/** Where `main`'s connectors turn before a card: halfway across the room it leaves. */
const GAP = { LR: 96, TB: 48 };

/** How far the trail moves over to make room for the marker: none when checks on main are off. */
export function mainRoom(direction: LayoutDirection, shown: boolean) {
  return shown ? ROOM[direction] : { x: 0, y: 0 };
}

/**
 * Where `main` sits, in the trail's coordinates (left of or above its first tickets, in line with the first one when
 * there is one), and the thin connectors from it
 * to every ticket that waits on no other: the trail starts from the default branch. A wrapped layer of first tickets
 * gets one connector, to a bracket along its near side.
 */
export function mainSpot(input: {
  direction: LayoutDirection;
  nodes: LaidOutNode[];
  groups: LayoutGroup[];
  graphH: number;
  width: number;
}) {
  const { direction, nodes, groups } = input;
  const ends = nodes.filter(
    (n) => n.state !== 'out-of-scope' && !n.ticket.blockedBy.some((b) => nodes.some((m) => m.ticket.id === b)),
  );
  const { whole, single } = bracketedGroups({ groups, nodes, ends });
  const cards = cardRects(nodes);
  const gap = GAP[direction];
  const line = lineAcross({ direction, nodes, groups, ends });
  const spot =
    direction === 'LR'
      ? { x: -ROOM.LR.x + 20, y: (line ?? input.graphH / 2) - MAIN_H / 2 }
      : { x: (line ?? input.width / 2) - MAIN_W / 2, y: -ROOM.TB.y + 16 };
  const a =
    direction === 'LR'
      ? { x: spot.x + MAIN_W, y: spot.y + MAIN_H / 2 }
      : { x: spot.x + MAIN_W / 2, y: spot.y + MAIN_H };
  const entry = (n: LaidOutNode) =>
    direction === 'LR' ? { x: n.x, y: n.y + NODE_H / 2 } : { x: n.x + NODE_W / 2, y: n.y };
  const toCards = single.map((n) => {
    const gapIn = nodeGaps({ direction, node: n, outer: gap }).before;
    return routeEdge({ direction, a, b: entry(n), obstacles: cards, gap, gapIn });
  });
  const toGroups = whole.flatMap((group) => {
    const bracket = groupBracket({ direction, group, side: 'before' });
    return [routeEdge({ direction, a, b: bracket.at, obstacles: cards, gap, gapIn: gap - 32 }), bracket.d];
  });
  return { ...spot, edges: [...toCards, ...toGroups] };
}
