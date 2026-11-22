import { type Box, type Pt } from './types';

/** Clear space kept around a page's own trail. */
const MARGIN = 16;

/** The corners of a path written only in M, H, V and h (as the site's hero trail is). */
function pathPoints(d: string): Pt[] {
  const pts: Pt[] = [];
  let [x, y] = [0, 0];
  for (const [, cmd, args] of d.matchAll(/([MHVh])([^MHVh]*)/g)) {
    const n = args
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (cmd === 'M') [x, y] = [n[0], n[1]];
    if (cmd === 'H') x = n[0];
    if (cmd === 'V') y = n[0];
    if (cmd === 'h') x += n[0];
    pts.push([x, y]);
  }
  return pts;
}

/** Boxes around every segment of the page's own trails (`svg.trail`) that show, so the field never crosses them. */
export function trailBoxes(top: number): Box[] {
  const boxes: Box[] = [];
  for (const svg of document.querySelectorAll<SVGSVGElement>('svg.trail')) {
    const ctm = svg.getScreenCTM();
    if (!ctm || !svg.getBoundingClientRect().width) continue;
    for (const path of svg.querySelectorAll<SVGPathElement>(':scope > path')) {
      const pts = pathPoints(path.getAttribute('d') ?? '').map(([x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(ctm);
        return [p.x + window.scrollX, p.y + window.scrollY - top] as Pt;
      });
      for (let i = 0; i < pts.length; i++) {
        const [a, b] = [pts[Math.max(0, i - 1)], pts[i]];
        boxes.push({
          x0: Math.min(a[0], b[0]) - MARGIN,
          y0: Math.min(a[1], b[1]) - MARGIN,
          x1: Math.max(a[0], b[0]) + MARGIN,
          y1: Math.max(a[1], b[1]) + MARGIN,
        });
      }
    }
  }
  return boxes;
}
