/** How round a connector's corners are. */
const CORNER = 6;

type Point = { x: number; y: number };

/** An SVG path through horizontal and vertical runs, with slightly rounded corners. */
export function orthoPath(points: Point[]) {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [prev, p, next] = [pts[i - 1], pts[i], pts[i + 1]];
    const r = Math.min(CORNER, dist(prev, p) / 2, dist(p, next) / 2);
    const before = toward(p, prev, r);
    const after = toward(p, next, r);
    d += `L${before.x} ${before.y}Q${p.x} ${p.y} ${after.x} ${after.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d}L${last.x} ${last.y}`;
}

function dist(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** The point `r` from `p` toward `q`, on a horizontal or vertical run. */
function toward(p: Point, q: Point, r: number) {
  return { x: p.x + Math.sign(q.x - p.x) * r, y: p.y + Math.sign(q.y - p.y) * r };
}
