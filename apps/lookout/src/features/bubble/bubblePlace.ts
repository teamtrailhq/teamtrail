import type { AnchorRect } from '../map';

/** Space between the bubble and what it points at, and between it and the map's edge. */
const GAP = 14;
const MARGIN = 8;

/**
 * Where the bubble goes inside the map: beside its anchor on the side with room (right first), level with it and kept
 * inside the box. With no anchor (a question about the whole trail, a ticket off the map), the top right corner.
 */
export function bubblePlace(input: {
  anchor?: AnchorRect;
  box: { w: number; h: number };
  bubble: { w: number; h: number };
}): { left: number; top: number; side: 'right' | 'left' | 'corner' } {
  const { anchor, box, bubble } = input;
  const maxLeft = Math.max(MARGIN, box.w - bubble.w - MARGIN);
  const maxTop = Math.max(MARGIN, box.h - bubble.h - MARGIN);
  if (!anchor) return { left: maxLeft, top: MARGIN, side: 'corner' };
  const middle = (anchor.top + anchor.bottom) / 2;
  const top = Math.min(maxTop, Math.max(MARGIN, middle - bubble.h / 2));
  const right = anchor.right + GAP;
  const left = anchor.left - GAP - bubble.w;
  if (right + bubble.w <= box.w - MARGIN) return { left: right, top, side: 'right' };
  if (left >= MARGIN) return { left, top, side: 'left' };
  const roomRight = box.w - anchor.right;
  const roomLeft = anchor.left;
  if (roomRight >= roomLeft) return { left: Math.min(right, maxLeft), top, side: 'right' };
  return { left: Math.max(MARGIN, left), top, side: 'left' };
}
