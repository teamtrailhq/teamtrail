import { type LaidOutNode, NODE_H, NODE_W } from '@teamtrail/core';
import type { Rect } from './routeEdge';

/** The cards connectors keep clear of: every ticket on the trail (cancelled ones sit apart, below it). */
export function cardRects(nodes: LaidOutNode[]): Rect[] {
  return nodes.filter((n) => n.state !== 'out-of-scope').map((n) => ({ x: n.x, y: n.y, w: NODE_W, h: NODE_H }));
}
