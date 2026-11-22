import { type ThemeControl } from '../browser/types';
import { type Box, type Live, type WalkOptions } from './types';

/** Where the trail field may draw, measured from the page, in canvas pixels (fieldGeometry.ts). */
export type Geometry = {
  /** The canvas's top in the document (where its host starts) and its size in CSS pixels. */
  top: number;
  width: number;
  height: number;
  dpr: number;
  grid: number;
  area: Box;
  blocked: Box[];
  exits: WalkOptions['exits'];
  /** How many trails to keep alive at once. */
  target: number;
};

/** What a page tells the trail field (mountTrailField.ts). */
export type TrailFieldOptions = {
  /** The element the field sits in, behind its content: the canvas becomes its first child. */
  host: HTMLElement;
  /** The page's content the field keeps clear of (40px): them, and the column they stand in down to the frame. */
  clear: () => Element[];
  /**
   * A frame the field ends under (22px clear), as the site's hero video; without one it runs to the host's bottom
   * and may leave by it.
   */
  frame?: () => Element | null;
  /** Elements whose size moves the content: the field lays itself out again when one changes. */
  watch?: Element[];
  reducedMotion: boolean;
  /** The page's theme, so the field takes the new colours when it changes. */
  theme: ThemeControl;
  /** How strong the trails are, 0 to 1: by default half of a page trail's `--trail-alpha` (0.35 without one). */
  strength?: number;
};

/** A trail on the field and where it is in its life: growing, holding while its pulse runs, then leaving. */
export type Trail = Live & {
  phase: 'grow' | 'hold' | 'fade' | 'retract';
  speed: number;
  exit: 'fade' | 'retract';
  until: number;
};
