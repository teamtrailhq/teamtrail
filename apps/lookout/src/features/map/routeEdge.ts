import type { LayoutDirection } from '@teamtrail/core';
import { freeLane } from './freeLane';
import { orthoPath } from './orthoPath';

type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * An orthogonal connector from `a` (a card's exit edge) to `b` (another's entry edge), like a file tree. It runs
 * along the layout's direction and turns in the gaps between layers (`gap` wide), never across a card in between:
 * it keeps to `a`'s lane or `b`'s when that lane is clear, else it takes the nearest clear lane between the cards.
 */
export function routeEdge(input: { direction: LayoutDirection; a: Point; b: Point; obstacles: Rect[]; gap: number }) {
  const flip = input.direction === 'TB';
  const swap = (p: Point) => (flip ? { x: p.y, y: p.x } : p);
  const a = swap(input.a);
  const b = swap(input.b);
  const obstacles = input.obstacles.map((o) => (flip ? { x: o.y, y: o.x, w: o.h, h: o.w } : o));
  return orthoPath(routeAcross({ a, b, obstacles, gap: input.gap }).map(swap));
}

/** The route laid left to right: `x` runs along the layers, `y` across the lanes. */
function routeAcross({ a, b, obstacles, gap }: { a: Point; b: Point; obstacles: Rect[]; gap: number }): Point[] {
  const between = obstacles.filter((o) => o.x + o.w > a.x + 1 && o.x < b.x - 1);
  const clear = (y: number) => !between.some((o) => y > o.y - 8 && y < o.y + o.h + 8);
  const near = Math.min(a.x + gap / 2, (a.x + b.x) / 2);
  const far = Math.max(b.x - gap / 2, (a.x + b.x) / 2);
  if (clear(a.y)) return [a, { x: far, y: a.y }, { x: far, y: b.y }, b];
  if (clear(b.y)) return [a, { x: near, y: a.y }, { x: near, y: b.y }, b];
  const y = freeLane({ obstacles: between, from: a.y, to: b.y, clear });
  return [a, { x: near, y: a.y }, { x: near, y }, { x: far, y }, { x: far, y: b.y }, b];
}
