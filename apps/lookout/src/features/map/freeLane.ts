/**
 * The clear lane (a `y` no card in the way covers) closest to both ends of a connector: the middle of a gap above or
 * below one of the cards.
 */
export function freeLane(input: {
  obstacles: { y: number; h: number }[];
  from: number;
  to: number;
  clear: (y: number) => boolean;
}) {
  const { obstacles, from, to, clear } = input;
  const candidates = obstacles.flatMap((o) => [o.y - 28, o.y + o.h + 28]).filter(clear);
  const cost = (y: number) => Math.abs(y - from) + Math.abs(y - to);
  return candidates.reduce((best, y) => (cost(y) < cost(best) ? y : best), candidates[0] ?? from);
}
