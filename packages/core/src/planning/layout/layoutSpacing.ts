import { NODE_H, NODE_W } from './nodeSize';

/**
 * How the layered layout spaces cards, per direction: `layer` from one layer to the next (along the trail), `lane`
 * from one card to the next across it, `sub` between the sub-columns (LR) or sub-rows (TB) of a wrapped layer, and
 * the card's own size `along` and `across`. `aspect` is the shape wrapping aims for: the map at least this many times
 * as long (along the trail) as it is wide across it. Left to right suits a wide screen; top to bottom, chosen for a
 * narrow one, aims for a portrait shape.
 */
export const LAYOUT_SPACING = {
  LR: { layer: 330, lane: 112, sub: 260, along: NODE_W, across: NODE_H, aspect: 1.6 },
  TB: { layer: 124, lane: 262, sub: 100, along: NODE_H, across: NODE_W, aspect: 4 / 3 },
} as const;
