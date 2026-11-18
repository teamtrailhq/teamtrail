import { layout, type LayoutDirection, NODE_H, NODE_W, type Ticket } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { cardRects } from '../src/features/map/cardRects';
import { destinationSpot, destinationTrail } from '../src/features/map/destination';
import { edgePath } from '../src/features/map/edgePath';
import { mainSpot } from '../src/features/map/mainSpot';

const ticket = (n: number, blockedBy: number[] = []): Ticket => ({
  id: String(n),
  key: `#${n}`,
  title: `Ticket ${n}`,
  type: 'task',
  body: '',
  state: 'closed',
  closeReason: 'completed',
  blockedBy: blockedBy.map(String),
  comments: [],
  createdAt: n,
  updatedAt: n,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

/** Every point a path passes through, corners (the rounding's control points) included. */
const points = (d: string): Point[] => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));

/** Whether a horizontal or vertical run passes through a card, not just touching its edge. */
function crosses(p: Point, q: Point, r: Rect) {
  const inside = (v: number, lo: number, len: number) => v > lo + 1 && v < lo + len - 1;
  const overlaps = (a: number, b: number, lo: number, len: number) =>
    Math.max(a, b) > lo + 1 && Math.min(a, b) < lo + len - 1;
  if (p.y === q.y) return inside(p.y, r.y, r.h) && overlaps(p.x, q.x, r.x, r.w);
  if (p.x === q.x) return inside(p.x, r.x, r.w) && overlaps(p.y, q.y, r.y, r.h);
  return false;
}

function crossings(paths: string[], cards: Rect[]) {
  return paths.flatMap((d) => {
    const pts = points(d);
    return pts.slice(1).flatMap((q, i) => cards.filter((r) => crosses(pts[i], q, r)).map((r) => ({ d, r })));
  });
}

function everyPath(tickets: Ticket[], direction: LayoutDirection) {
  const l = layout(tickets, direction);
  const cards = cardRects(l.nodes);
  const edges = l.edges.map(({ from, to }) => edgePath({ direction, from, to, cards }));
  const main = mainSpot({ direction, nodes: l.nodes, groups: l.groups, graphH: l.graphH, width: l.width });
  const end = destinationTrail(l, destinationSpot(l));
  return { l, cards, edges, main: main.edges, end };
}

/** A junction ahead of 24 tickets side by side; one after three of them, from different columns; one after it all. */
const branching = [ticket(1), ...range(2, 25).map((n) => ticket(n, [1])), ticket(26, [3, 10, 24]), ticket(27, [1, 26])];

describe('a wrapped layer on the map', () => {
  for (const direction of ['LR', 'TB'] as const) {
    it(`routes no connector through a card (${direction})`, () => {
      const { l, cards, edges, main, end } = everyPath(branching, direction);
      expect(l.groups).toHaveLength(1);
      expect(l.groups[0].subs).toBeGreaterThan(1);
      expect(crossings([...edges, ...main, ...end], cards)).toEqual([]);
    });

    it(`joins a whole layer of first and last tickets with one bracket each (${direction})`, () => {
      const { l, cards, main, end } = everyPath(
        range(1, 38).map((n) => ticket(n)),
        direction,
      );
      expect(l.groups[0].subs).toBeGreaterThan(1);
      // one connector and its bracket, at each end
      expect(main).toHaveLength(2);
      expect(end).toHaveLength(2);
      expect(crossings([...main, ...end], cards)).toEqual([]);
    });
  }

  it('enters a card past the first sub-column through the gap just before it', () => {
    const { l, edges } = everyPath(branching, 'LR');
    const inner = l.nodes.find((n) => n.wrap && n.wrap.sub === 2)!;
    const i = l.edges.findIndex((e) => e.to === inner);
    const pts = points(edges[i]);
    const last = pts[pts.length - 1];
    expect(last).toEqual({ x: inner.x, y: inner.y + NODE_H / 2 });
    // its last turn is 30px before the card: the middle of the 60px gap between sub-columns
    expect(pts.some((p) => p.x === inner.x - 30)).toBe(true);
    expect(NODE_W).toBe(200);
  });
});
