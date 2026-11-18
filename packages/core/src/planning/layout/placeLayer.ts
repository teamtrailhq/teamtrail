import type { LaneWish } from './types';

/**
 * Where each card of one layer goes across the trail, in the layer's order and at least `lane` apart. The cards are
 * placed one at a time, the strongest wish first, each as near its wish as the cards already placed allow; a card
 * that only wants to sit beside another goes after it, and one with no wish packs against its neighbours.
 */
export function placeLayer(input: { wishes: LaneWish[]; lane: number }): number[] {
  const { wishes, lane } = input;
  const at: (number | undefined)[] = wishes.map(() => undefined);
  const bounds = (i: number) => {
    let lo = -Infinity;
    let hi = Infinity;
    at.forEach((p, j) => {
      if (p === undefined) return;
      if (j < i) lo = Math.max(lo, p + (i - j) * lane);
      if (j > i) hi = Math.min(hi, p - (j - i) * lane);
    });
    return { lo, hi };
  };
  for (const i of placingOrder(wishes)) {
    const { lo, hi } = bounds(i);
    const want = wanted({ wish: wishes[i], at, lane });
    at[i] = want === undefined ? packed(lo, hi) : Math.min(hi, Math.max(lo, want));
  }
  return at.map((p) => p ?? 0);
}

/** The strongest wish first: by its weight, then the card with more connections, then the one nearer the middle. */
function placingOrder(wishes: LaneWish[]) {
  const middle = (wishes.length - 1) / 2;
  return wishes
    .map((w, i) => ({ w, i }))
    .sort(
      (a, b) =>
        b.w.weight - a.w.weight ||
        b.w.links - a.w.links ||
        Math.abs(a.i - middle) - Math.abs(b.i - middle) ||
        a.i - b.i,
    )
    .map(({ i }) => i);
}

/** Where a card wants to be: its own wish, or just after the card it sits beside once that one is placed. */
function wanted(input: { wish: LaneWish; at: (number | undefined)[]; lane: number }) {
  const { wish, at, lane } = input;
  if (wish.at !== undefined) return wish.at;
  if (wish.beside === undefined) return undefined;
  const other = at[wish.beside];
  return other === undefined ? undefined : other + lane;
}

/** A card with no wish: against the card before it, else the card after it, else at the start. */
function packed(lo: number, hi: number) {
  if (lo > -Infinity) return lo;
  if (hi < Infinity) return hi;
  return 0;
}
