import { LAYOUT_SPACING } from './layoutSpacing';
import type { LayoutDirection } from './types';

/** A layer of up to this many tickets always stays one column (LR) or row (TB). */
export const WRAP_AFTER = 6;

/**
 * How many sub-columns (LR) or sub-rows (TB) each layer takes, from how many tickets each has. Deterministic: while
 * the map is less than `aspect` times as long (along the trail) as it is wide across it, the widest layer across (the
 * first, on a tie) wraps once more, into one lane fewer, as long as it has more than `WRAP_AFTER` tickets. Every
 * other layer stays one column.
 */
export function wrapLayers(input: { sizes: number[]; direction: LayoutDirection }): number[] {
  const { sizes } = input;
  const s = LAYOUT_SPACING[input.direction];
  const subs = sizes.map(() => 1);
  const lanesOf = (i: number) => Math.ceil(sizes[i] / subs[i]);
  for (;;) {
    const lanes = Math.max(1, ...sizes.map((_, i) => lanesOf(i)));
    const along = sizes.reduce((sum, _, i) => sum + (subs[i] - 1) * s.sub + s.layer, 0) - (s.layer - s.along);
    const across = lanes * s.lane - (s.lane - s.across);
    if (along >= s.aspect * across || lanes <= 1) return subs;
    const widest = sizes.findIndex((_, i) => lanesOf(i) === lanes);
    if (sizes[widest] <= WRAP_AFTER) return subs;
    subs[widest] = Math.ceil(sizes[widest] / (lanes - 1));
  }
}
