import type { NodeState, Ticket } from '../../model/types';

export type LayoutDirection = 'LR' | 'TB';

/** Where a card sits in a wrapped layer: its group, and its sub-column (LR) or sub-row (TB) of how many. */
export interface LayoutWrap {
  group: number;
  sub: number;
  subs: number;
}

export interface LaidOutNode {
  ticket: Ticket;
  state: NodeState;
  x: number;
  y: number;
  layer: number;
  /** Set when the ticket's layer is wrapped into a grid (`wrapLayers`). */
  wrap?: LayoutWrap;
}

/** A layer wrapped into a grid: the box its cards fill, its sub-columns (LR) or sub-rows (TB), and its lanes. */
export interface LayoutGroup {
  layer: number;
  x: number;
  y: number;
  w: number;
  h: number;
  subs: number;
  lanes: number;
}
