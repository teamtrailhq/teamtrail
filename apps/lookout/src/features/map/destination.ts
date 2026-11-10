import { type LaidOutNode, type LayoutDirection, NODE_H, NODE_W } from '@teamtrail/core';
import { cardRects } from './cardRects';
import { routeEdge } from './routeEdge';

interface Laid {
  direction: LayoutDirection;
  nodes: LaidOutNode[];
  edges: { from: LaidOutNode; to: LaidOutNode }[];
  width: number;
  height: number;
  graphH: number;
}

/** Where the X goes, after the last tickets, and the map size once it's included. */
export function destinationSpot(l: Laid) {
  if (l.direction === 'LR') {
    const x = l.width + 96;
    return { x, y: l.graphH / 2, right: x + 34, bottom: l.height };
  }
  const y = l.graphH + 76;
  return { x: l.width / 2, y, right: l.width, bottom: Math.max(l.height, y + 40) };
}

/** The last stretches: from every ticket nothing else waits for, on to the X, as elbows like the other connectors. */
export function destinationTrail(l: Laid, spot: { x: number; y: number }) {
  const blocking = new Set(l.edges.map((e) => e.from));
  const lastOnes = l.nodes.filter((n) => n.state !== 'out-of-scope' && !blocking.has(n));
  const cards = cardRects(l.nodes);
  return lastOnes.map((n) => {
    if (l.direction === 'LR') {
      const a = { x: n.x + NODE_W, y: n.y + NODE_H / 2 };
      const b = { x: spot.x - 30, y: spot.y };
      return routeEdge({ direction: 'LR', a, b, obstacles: cards, gap: 96 });
    }
    const a = { x: n.x + NODE_W / 2, y: n.y + NODE_H };
    const b = { x: spot.x, y: spot.y - 30 };
    return routeEdge({ direction: 'TB', a, b, obstacles: cards, gap: 48 });
  });
}
