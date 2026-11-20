/** The banners' trail as fractions of the scene: square steps along a grid, from the left edge to the destination. */
const TRAIL: [number, number][] = [
  [0.03, 0.86],
  [0.17, 0.86],
  [0.17, 0.77],
  [0.38, 0.77],
  [0.38, 0.88],
  [0.58, 0.88],
  [0.58, 0.74],
  [0.78, 0.74],
  [0.78, 0.83],
  [0.93, 0.83],
];

/** The corners where the trail turns: the tickets it ticks off on its way, as indexes into the trail. */
export const TICKETS = [1, 3, 5, 7];

/** The trail in pixels, with each point's distance along it. */
export function trailPath(w: number, h: number) {
  const points = TRAIL.map(([x, y]) => [x * w, y * h] as [number, number]);
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    const [[ax, ay], [bx, by]] = [points[i - 1], points[i]];
    along.push(along[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  return { points, along, length: along[along.length - 1] };
}

/** The points walked once `progress` (0 to 1) of the trail's length is behind it, ending where the walker is. */
export function walkedPoints(w: number, h: number, progress: number) {
  const { points, along, length } = trailPath(w, h);
  const reach = length * Math.min(1, Math.max(0, progress));
  const walked: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (along[i] <= reach) {
      walked.push(points[i]);
      continue;
    }
    const k = (reach - along[i - 1]) / (along[i] - along[i - 1]);
    const [[ax, ay], [bx, by]] = [points[i - 1], points[i]];
    walked.push([ax + (bx - ax) * k, ay + (by - ay) * k]);
    break;
  }
  return walked;
}
