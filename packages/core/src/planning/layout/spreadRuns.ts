import type { LaneWish } from './types';

/** The weight of a card that continues a chain: it never gives way to its neighbours' wishes. */
export const CHAIN_WEIGHT = 4;

/**
 * Cards side by side that all want the same spot (the tickets one blocker opens) share it: they spread out evenly
 * around it, a review between them taking its slot, so the blocker stays in the middle of them. A chain's card is
 * never part of a run: it keeps its spot.
 */
export function spreadRuns(input: { wishes: LaneWish[]; lane: number }): LaneWish[] {
  const { wishes, lane } = input;
  const out = [...wishes];
  let i = 0;
  while (i < wishes.length) {
    const run = runFrom(wishes, i);
    if (run.length > 1) {
      const spot = wishes[i].at as number;
      const weight = wishes[i].weight;
      run.forEach((k, n) => {
        out[k] = { ...wishes[k], at: spot + (n - (run.length - 1) / 2) * lane, beside: undefined, weight };
      });
    }
    i = Math.max(i + 1, (run.at(-1) ?? i) + 1);
  }
  return out;
}

/** The run that starts at `i`: the cards after it wanting the same spot, and any review sitting between them. */
function runFrom(wishes: LaneWish[], i: number) {
  const first = wishes[i];
  if (!shareable(first)) return [i];
  const run = [i];
  let pending: number[] = [];
  for (let k = i + 1; k < wishes.length; k++) {
    const w = wishes[k];
    if (w.beside !== undefined) {
      pending.push(k);
      continue;
    }
    if (!shareable(w) || w.at !== first.at) break;
    run.push(...pending, k);
    pending = [];
  }
  return run;
}

const shareable = (w: LaneWish) => w.at !== undefined && w.weight < CHAIN_WEIGHT;
