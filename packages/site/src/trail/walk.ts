import { type Box, type Pt, type Route, type WalkOptions } from './types';

/**
 * Routes for the trail field (trailField.ts): seeded random walks on the page's dot grid, in right angles, around
 * boxes they must keep clear of (the copy, a frame, the nav, a page's own trail). Pure and deterministic: the same
 * seed, area and boxes give the same routes, so it can be tested without a browser.
 */
const DIRS: Pt[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const key = (cx: number, cy: number) => `${cx},${cy}`;

/** The fewest cells a route needs to be worth drawing. */
const MIN_CELLS = 7;

/** A route from a free cell, or null when none fits after a few tries. */
export function walk(o: WalkOptions): Route | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const route = tryWalk(o);
    if (route && route.cells.length >= MIN_CELLS) return route;
  }
  return null;
}

function tryWalk(o: WalkOptions): Route | null {
  const { rand, area, grid } = o;
  // A route never stops on an edge it may run off: it either keeps a cell clear of it or runs on past it.
  const cols = [Math.ceil(area.x0 / grid) + 1, Math.floor(area.x1 / grid) - 1];
  const rows = [Math.ceil(area.y0 / grid) + 1, Math.floor(area.y1 / grid) - 1];
  const inside = (cx: number, cy: number) => cx >= cols[0] && cx <= cols[1] && cy >= rows[0] && cy <= rows[1];
  const blocked = (cx: number, cy: number) =>
    o.blocked.some((b) => cx * grid >= b.x0 && cx * grid <= b.x1 && cy * grid >= b.y0 && cy * grid <= b.y1);
  const nearTaken = (cx: number, cy: number) =>
    o.taken.has(key(cx, cy)) || DIRS.some(([dx, dy]) => o.taken.has(key(cx + dx, cy + dy)));
  const free = (cx: number, cy: number) => inside(cx, cy) && !blocked(cx, cy) && !nearTaken(cx, cy);

  const sx = cols[0] + Math.floor(rand() * (cols[1] - cols[0] + 1));
  const sy = rows[0] + Math.floor(rand() * (rows[1] - rows[0] + 1));
  if (!free(sx, sy)) return null;

  const visited = new Set<string>([key(sx, sy)]);
  // Touching its own path only where it came from keeps a route from folding back along itself.
  const ownClear = (cx: number, cy: number, from: string) =>
    !visited.has(key(cx, cy)) &&
    DIRS.every(([dx, dy]) => key(cx + dx, cy + dy) === from || !visited.has(key(cx + dx, cy + dy)));

  const cellPts: Pt[] = [[sx, sy]];
  const corners: number[] = [0];
  let dir = Math.floor(rand() * 4);
  let [cx, cy] = [sx, sy];
  let end: Route['end'] = 'dest';
  const segments = 3 + Math.floor(rand() * 4);

  for (let seg = 0; seg < segments && end === 'dest'; seg++) {
    if (seg > 0) dir = (dir + (rand() < 0.5 ? 1 : 3)) % 4;
    const want = 2 + Math.floor(rand() * 6);
    const [dx, dy] = DIRS[dir];
    let moved = 0;
    while (moved < want) {
      const [nx, ny] = [cx + dx, cy + dy];
      if (!inside(nx, ny) && exitAllowed(o, dx, dy)) {
        end = 'edge';
        break;
      }
      if (!free(nx, ny) || !ownClear(nx, ny, key(cx, cy))) break;
      visited.add(key(nx, ny));
      cellPts.push([nx, ny]);
      [cx, cy] = [nx, ny];
      moved++;
    }
    if (moved === 0 && end === 'dest') break;
    corners.push(cellPts.length - 1);
  }

  const cells = [...visited];
  const toPx = ([x, y]: Pt): Pt => [x * grid, y * grid];
  const points = dedupe(corners.map((i) => toPx(cellPts[i])));
  if (points.length < 2) return null;
  if (end === 'edge') points.push(edgePoint(points[points.length - 1], DIRS[dir], area, grid));

  const junctions = points
    .map((_, at) => at)
    .filter((at) => at > 0 && at < points.length - 1 && rand() < 0.55)
    .map((at) => ({ at, hollow: rand() < 0.2 }));
  const branch = pickBranch({ o, points, junctions, free, visited, rand });
  if (branch) cells.push(...branch.cells);
  return { points, junctions, branch: branch && { at: branch.at, to: branch.to }, end, cells };
}

function exitAllowed(o: WalkOptions, dx: number, dy: number) {
  if (dx < 0) return o.exits.left;
  if (dx > 0) return o.exits.right;
  if (dy < 0) return o.exits.top;
  return o.exits.bottom;
}

/** Where a route running off an edge stops: a little past the edge, so its end is never seen. */
function edgePoint([x, y]: Pt, [dx, dy]: Pt, area: Box, grid: number): Pt {
  if (dx < 0) return [area.x0 - grid, y];
  if (dx > 0) return [area.x1 + grid, y];
  if (dy < 0) return [x, area.y0 - 2];
  return [x, area.y1 + grid];
}

function dedupe(points: Pt[]) {
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

/** Now and then a junction gets a dashed stub straight on, the way the trail didn't go. */
function pickBranch(a: {
  o: WalkOptions;
  points: Pt[];
  junctions: Route['junctions'];
  free: (cx: number, cy: number) => boolean;
  visited: Set<string>;
  rand: () => number;
}) {
  if (!a.junctions.length || a.rand() > 0.45) return null;
  const { at } = a.junctions[Math.floor(a.rand() * a.junctions.length)];
  const grid = a.o.grid;
  const [px, py] = a.points[at];
  const [qx, qy] = a.points[at - 1];
  const step: Pt = [Math.sign(px - qx), Math.sign(py - qy)];
  const len = 2 + Math.floor(a.rand() * 2);
  const cells: string[] = [];
  for (let i = 1; i <= len; i++) {
    const [cx, cy] = [px / grid + step[0] * i, py / grid + step[1] * i];
    if (!a.free(cx, cy) || a.visited.has(key(cx, cy))) return null;
    cells.push(key(cx, cy));
  }
  return { at, to: [px + step[0] * len * grid, py + step[1] * len * grid] as Pt, cells };
}
