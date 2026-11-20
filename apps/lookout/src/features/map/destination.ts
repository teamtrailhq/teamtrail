import { type LaidOutNode, type LayoutDirection, type LayoutGroup, NODE_H, NODE_W } from '@teamtrail/core';
import { bracketedGroups } from './bracketedGroups';
import { cardRects } from './cardRects';
import { groupBracket } from './groupBracket';
import { lineAcross } from './lineAcross';
import { nodeGaps } from './nodeGaps';
import { routeEdge } from './routeEdge';

interface Laid {
  direction: LayoutDirection;
  nodes: LaidOutNode[];
  edges: { from: LaidOutNode; to: LaidOutNode }[];
  groups: LayoutGroup[];
  width: number;
  height: number;
  graphH: number;
}

/** Where the last stretches turn before the finish square: halfway across the room before it. */
const GAP = { LR: 96, TB: 48 };

/** Half the finish square's side (DestinationGlyph): the last stretches meet its near side. */
const SQUARE_HALF = 12;

/**
 * Where the finish square goes (its centre), after the last tickets (in line with the last one when there is one), and the map size once it's
 * included.
 */
export function destinationSpot(l: Laid) {
  const line = lineAcross({ ...l, ends: lastTickets(l) });
  if (l.direction === 'LR') {
    const x = l.width + 96;
    return { x, y: line ?? l.graphH / 2, right: x + 34, bottom: l.height };
  }
  const y = l.graphH + 76;
  return { x: line ?? l.width / 2, y, right: l.width, bottom: Math.max(l.height, y + 40) };
}

/** The tickets nothing else on the map waits for. */
function lastTickets(l: Laid) {
  const blocking = new Set(l.edges.map((e) => e.from));
  return l.nodes.filter((n) => n.state !== 'out-of-scope' && !blocking.has(n));
}

/**
 * The last stretches: from every ticket nothing else waits for, on to the finish square's near side, as elbows like the other connectors. A
 * wrapped layer of last tickets gets one stretch, from a bracket along its far side.
 */
export function destinationTrail(l: Laid, spot: { x: number; y: number }) {
  const { direction } = l;
  const { whole, single } = bracketedGroups({ groups: l.groups, nodes: l.nodes, ends: lastTickets(l) });
  const cards = cardRects(l.nodes);
  const gap = GAP[direction];
  const b = direction === 'LR' ? { x: spot.x - SQUARE_HALF, y: spot.y } : { x: spot.x, y: spot.y - SQUARE_HALF };
  const exit = (n: LaidOutNode) =>
    direction === 'LR' ? { x: n.x + NODE_W, y: n.y + NODE_H / 2 } : { x: n.x + NODE_W / 2, y: n.y + NODE_H };
  const fromCards = single.map((n) => {
    const after = nodeGaps({ direction, node: n, outer: gap }).after;
    return routeEdge({ direction, a: exit(n), b, obstacles: cards, gap: after, gapIn: gap });
  });
  const fromGroups = whole.flatMap((group) => {
    const bracket = groupBracket({ direction, group, side: 'after' });
    return [bracket.d, routeEdge({ direction, a: bracket.at, b, obstacles: cards, gap: gap - 32, gapIn: gap })];
  });
  return [...fromCards, ...fromGroups];
}
