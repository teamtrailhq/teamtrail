import { type Geometry, type TrailFieldOptions } from './fieldTypes';
import { trailBoxes } from './trailBoxes';
import { type Box } from './types';

/** The dot grid's step (the pages' background-size). */
const GRID = 20;
/** Clear space kept around the copy and the frame. */
const TEXT_MARGIN = 40;
const FRAME_MARGIN = 22;

/** How many trails a field this wide keeps alive. */
const targetFor = (width: number) => {
  if (width < 1300) return 3;
  return width < 1700 ? 4 : 5;
};

/**
 * Where the field may draw: the host's margins, clear of the page's content (and the column it stands in, from
 * the top down to the frame, or the bottom without one), the frame, the nav and the page's own trails.
 */
export function fieldGeometry(o: Pick<TrailFieldOptions, 'host' | 'clear' | 'frame'>, canvas: HTMLCanvasElement) {
  const host = o.host.getBoundingClientRect();
  const top = host.top + window.scrollY;
  const box = (r: DOMRect, m: number): Box => ({
    x0: r.left + window.scrollX - m,
    y0: r.top + window.scrollY - top - m,
    x1: r.right + window.scrollX + m,
    y1: r.bottom + window.scrollY - top + m,
  });
  const width = canvas.getBoundingClientRect().width || document.documentElement.clientWidth;
  const frame = o.frame?.()?.getBoundingClientRect();
  const frameBox = frame ? box(frame, FRAME_MARGIN) : undefined;
  const bottom = frameBox ? frameBox.y1 + 6 : host.height;
  const copy = o.clear().map((el) => box(el.getBoundingClientRect(), TEXT_MARGIN));
  const columnEnd = frameBox ? frameBox.y0 : bottom;
  const column: Box[] = copy.length
    ? [{ x0: Math.min(...copy.map((b) => b.x0)), y0: 0, x1: Math.max(...copy.map((b) => b.x1)), y1: columnEnd }]
    : [];
  const nav = document.querySelector<HTMLElement>('[data-site-nav]');
  const geometry: Geometry = {
    top,
    width,
    height: bottom + GRID,
    dpr: Math.min(2, window.devicePixelRatio || 1),
    grid: GRID,
    area: { x0: 0, y0: Math.max(0, (nav?.offsetHeight ?? 0) - top), x1: width, y1: bottom },
    blocked: [...copy, ...column, ...(frameBox ? [frameBox] : []), ...trailBoxes(top)],
    exits: { left: true, right: true, top: true, bottom: !frameBox },
    target: targetFor(width),
  };
  return geometry;
}
