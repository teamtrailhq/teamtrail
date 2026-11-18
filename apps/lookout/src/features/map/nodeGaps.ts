import { type LaidOutNode, LAYOUT_SPACING, type LayoutDirection } from '@teamtrail/core';

/**
 * The gaps either side of a card along the trail, where connectors into it (`before`) and out of it (`after`) turn:
 * `outer` between layers, the narrower gap between the sub-columns (LR) or sub-rows (TB) inside a wrapped layer.
 */
export function nodeGaps(input: { direction: LayoutDirection; node: LaidOutNode; outer: number }) {
  const s = LAYOUT_SPACING[input.direction];
  const inner = s.sub - s.along;
  const wrap = input.node.wrap;
  const before = wrap && wrap.sub > 0 ? inner : input.outer;
  const after = wrap && wrap.sub < wrap.subs - 1 ? inner : input.outer;
  return { before, after };
}
