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

/**
 * Where a card wants to sit across the trail when its layer is placed (`placeLayer`): `at` a position, or `beside`
 * another card of the layer (a review beside the ticket it reviews), with a `weight` (the higher is placed first and
 * moves least) and how many cards it connects to (`links`, which breaks ties).
 */
export interface LaneWish {
  at?: number;
  beside?: number;
  weight: number;
  links: number;
}

/** One layer to place: its tickets in order, and how many lanes and sub-columns (LR) or sub-rows (TB) it takes. */
export interface LayoutLayer {
  tickets: Ticket[];
  lanes: number;
  subs: number;
}

/** Which way a sweep looks: at the tickets a card waits on, or at the ones that wait on it. */
export type Toward = 'blockers' | 'blocked';

/** Each placed ticket's blockers and the tickets it blocks, among the cards on the map. */
export interface LaneLinks {
  blockers: Map<string, string[]>;
  blocked: Map<string, string[]>;
}
