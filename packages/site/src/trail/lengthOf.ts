import { type Pt } from './types';

/** Total length of a polyline in pixels. */
export function lengthOf(points: Pt[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++)
    total += Math.abs(points[i][0] - points[i - 1][0]) + Math.abs(points[i][1] - points[i - 1][1]);
  return total;
}
