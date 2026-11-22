import { type Live, type Route } from './types';

/** A route as a live trail, not yet drawn: the distance along it to each of its points. */
export function liveOf(route: Route): Live {
  const dists = [0];
  for (let i = 1; i < route.points.length; i++) {
    const [[ax, ay], [bx, by]] = [route.points[i - 1], route.points[i]];
    dists.push(dists[i - 1] + Math.abs(bx - ax) + Math.abs(by - ay));
  }
  return { route, dists, len: dists[dists.length - 1], head: 0, tail: 0, alpha: 1, pulse: null };
}
