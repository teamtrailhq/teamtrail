import { describe, expect, it } from 'vitest';
import { freeLane } from '../src/features/map/freeLane';
import { orthoPath } from '../src/features/map/orthoPath';
import { routeEdge } from '../src/features/map/routeEdge';

/** The corner points a path passes through, ignoring the rounding. */
const corners = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);

describe('orthoPath', () => {
  it('draws a straight run as one line', () => {
    expect(
      orthoPath([
        { x: 0, y: 10 },
        { x: 50, y: 10 },
      ]),
    ).toBe('M0 10L50 10');
  });

  it('rounds the corners of an elbow', () => {
    const d = orthoPath([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 80, y: 30 },
    ]);
    expect(d).toBe('M0 0L34 0Q40 0 40 6L40 24Q40 30 46 30L80 30');
  });

  it('keeps corners no bigger than half a short run', () => {
    const d = orthoPath([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 4 },
      { x: 80, y: 4 },
    ]);
    expect(d).toContain('L38 0Q40 0 40 2');
  });
});

describe('routeEdge', () => {
  const card = (x: number, y: number) => ({ x, y, w: 200, h: 56 });

  it('turns once, in the gap before the blocked card, when nothing is in the way', () => {
    const d = routeEdge({ direction: 'LR', a: { x: 200, y: 28 }, b: { x: 330, y: 140 }, obstacles: [], gap: 130 });
    expect(d.startsWith('M200 28L259 28Q265 28 265 34')).toBe(true);
    expect(d.endsWith('L330 140')).toBe(true);
  });

  it('keeps to the blocked card’s lane when the blocker’s lane has a card in between', () => {
    const between = card(330, 0);
    const d = routeEdge({
      direction: 'LR',
      a: { x: 200, y: 28 },
      b: { x: 660, y: 140 },
      obstacles: [between],
      gap: 130,
    });
    expect(d.endsWith('L660 140')).toBe(true);
    expect(d).toContain('L265 '); // turns right after the blocker
    expect(corners(d).every(([x, y]) => !(x > 330 && x < 530 && y > 0 && y < 56))).toBe(true);
  });

  it('takes a clear lane between the cards when both lanes are taken', () => {
    const obstacles = [card(330, 0), card(330, 112)];
    const d = routeEdge({ direction: 'LR', a: { x: 200, y: 28 }, b: { x: 660, y: 140 }, obstacles, gap: 130 });
    expect(d).toContain('84'); // the gap between the two cards in between
  });

  it('runs top to bottom in a vertical layout', () => {
    const d = routeEdge({ direction: 'TB', a: { x: 100, y: 56 }, b: { x: 362, y: 124 }, obstacles: [], gap: 68 });
    expect(d.startsWith('M100 56L100 84')).toBe(true);
    expect(d.endsWith('L362 124')).toBe(true);
  });
});

describe('freeLane', () => {
  it('picks the clear gap closest to both ends', () => {
    const obstacles = [
      { y: 0, h: 56 },
      { y: 112, h: 56 },
    ];
    const clear = (y: number) => !obstacles.some((o) => y > o.y - 8 && y < o.y + o.h + 8);
    expect(freeLane({ obstacles, from: 28, to: 140, clear })).toBe(84);
  });

  it('falls back to the start when nothing is clear', () => {
    expect(freeLane({ obstacles: [], from: 10, to: 90, clear: () => false })).toBe(10);
  });
});
