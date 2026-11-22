/**
 * The trail field's shapes (trailField.ts): routes are seeded random walks on the page's dot grid (walk.ts), in right
 * angles, around boxes they keep clear of; a live trail is one being drawn on the canvas (paintTrail.ts).
 */

/** A box in canvas pixels: left, top, right, bottom. */
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Pt = [number, number];

export type Route = {
  /** Corners, first to last, on the grid (the last may sit just past an edge it runs off). */
  points: Pt[];
  /** Corners (indexes into points) drawn as junction squares; `hollow` ones wait. */
  junctions: { at: number; hollow: boolean }[];
  /** A dashed path not taken, from one junction: its two ends. */
  branch: { at: number; to: Pt } | null;
  /** How it ends: at a destination dot, or running off an edge of the area. */
  end: 'dest' | 'edge';
  /** The grid cells it uses ("x,y" in cells), so the next routes keep clear of it. */
  cells: string[];
};

export type WalkOptions = {
  rand: () => number;
  /** Where routes may go, in pixels. */
  area: Box;
  /** Boxes no route may enter, margins already added. */
  blocked: Box[];
  /** Cells other routes use: a route keeps one cell clear of them. */
  taken: Set<string>;
  /** The grid step in pixels (the dot grid's). */
  grid: number;
  /** The area's edges a route may run off; at any other edge it ends at a destination. */
  exits: { left: boolean; right: boolean; top: boolean; bottom: boolean };
};

/** One trail on the field as it stands: drawn from `tail` to `head` (pixels along it), at `alpha`. */
export type Live = {
  route: Route;
  /** Distance along the route to each of its points. */
  dists: number[];
  len: number;
  head: number;
  tail: number;
  alpha: number;
  /** Where a pulse's front is, or null when none runs. */
  pulse: number | null;
};

/** The field's colours, from the page's tokens (styles.css), and its strength against the main trail. */
export type Palette = { line: string; blaze: string; node: string; branch: string; bg: string; alpha: number };
