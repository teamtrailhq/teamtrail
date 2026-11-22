import assert from 'node:assert/strict';
import { test } from 'vitest';
import { lengthOf } from '../src/trail/lengthOf';
import { seeded } from '../src/trail/seeded';
import { type Box, type Pt, type Route } from '../src/trail/types';
import { walk } from '../src/trail/walk';

const GRID = 20;
const area = { x0: 0, y0: 64, x1: 1440, y1: 1450 };
// The copy's column and the video's frame at 1440px, with their margins.
const blocked = [
  { x0: 234, y0: 0, x1: 1206, y1: 690 },
  { x0: 98, y0: 688, x1: 1342, y1: 1436 },
];
const exits = { left: true, right: true, top: true, bottom: false };

function routes(seed: number, count: number) {
  const rand = seeded(seed);
  const taken = new Set<string>();
  const out: Route[] = [];
  for (let i = 0; i < count; i++) {
    const route = walk({ rand, area, blocked, taken, grid: GRID, exits });
    if (!route) continue;
    for (const c of route.cells) taken.add(c);
    out.push(route);
  }
  return out;
}

/** Every grid point a route's segments pass through, its path not taken included. */
function samples(route: Route) {
  const segs: [Pt, Pt][] = route.points.slice(1).map((p, i) => [route.points[i], p]);
  if (route.branch) segs.push([route.points[route.branch.at], route.branch.to]);
  const pts: Pt[] = [];
  for (const [[ax, ay], [bx, by]] of segs) {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / GRID;
    for (let k = 0; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return pts;
}

const inArea = ([x, y]: Pt) => x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1;
const inBox = ([x, y]: Pt, b: Box) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

test('the same seed walks the same routes; another seed, others', () => {
  assert.deepEqual(routes(7, 6), routes(7, 6));
  assert.notDeepEqual(routes(7, 6), routes(8, 6));
});

test('routes step at right angles on the grid and are long enough to draw', () => {
  for (const route of routes(11, 8)) {
    assert.ok(lengthOf(route.points) >= 6 * GRID);
    for (let i = 1; i < route.points.length; i++) {
      const [[ax, ay], [bx, by]] = [route.points[i - 1], route.points[i]];
      assert.ok(ax === bx || ay === by, 'a segment is horizontal or vertical');
    }
    const onGrid = route.end === 'edge' ? route.points.slice(0, -1) : route.points;
    for (const [x, y] of onGrid) assert.ok(x % GRID === 0 && y % GRID === 0, `${x},${y} is on the grid`);
  }
});

test('no route enters a blocked box, and only an edge route leaves the area', () => {
  const all: Route[] = [];
  for (let seed = 1; seed <= 40; seed++) all.push(...routes(seed, 5));
  assert.ok(all.length > 100);
  for (const route of all) {
    const pts = samples(route);
    for (const p of pts) for (const b of blocked) assert.ok(!inBox(p, b), `${p} is in a blocked box`);
    const outside = pts.filter((p) => !inArea(p));
    if (route.end === 'dest') assert.equal(outside.length, 0);
    else assert.ok(outside.length <= 1);
  }
});

test('routes keep a cell clear of each other', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const cellsOf = routes(seed, 5).map((r) => new Set(r.cells));
    for (let a = 0; a < cellsOf.length; a++)
      for (let b = a + 1; b < cellsOf.length; b++)
        for (const c of cellsOf[a]) {
          const [x, y] = c.split(',').map(Number);
          for (const n of [c, `${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`])
            assert.ok(!cellsOf[b].has(n), `routes ${a} and ${b} touch at ${n}`);
        }
  }
});
