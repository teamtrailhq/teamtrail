import { type PointerEvent, type RefObject, useRef } from 'react';
import { type View, zoomAt } from './zoomAt';

type Point = { x: number; y: number };

/**
 * Drag to pan, pinch to zoom. A drag past a few pixels swallows the click that ends it, so panning never selects a
 * ticket. `onTouch` marks the view as the user's own (the map stops fitting itself).
 */
export function useMapGestures(input: {
  box: RefObject<HTMLDivElement>;
  view: View;
  setView: (v: View) => void;
  onTouch: () => void;
}) {
  const { box, view, setView } = input;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: View; dist: number; mid: Point; moved: boolean } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = () => {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { view, dist, mid, moved: gesture.current?.moved ?? false };
  };
  const pinch = (g: NonNullable<typeof gesture.current>, pts: Point[]) => {
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const z = zoomAt(g.view, (g.view.k * dist) / (g.dist || dist), g.mid);
    setView({ ...z, x: z.x + mid.x - g.mid.x, y: z.y + mid.y - g.mid.y });
    g.moved = true;
  };
  const pan = (e: PointerEvent, g: NonNullable<typeof gesture.current>, p: Point) => {
    const dx = p.x - g.mid.x;
    const dy = p.y - g.mid.y;
    if (!g.moved && Math.hypot(dx, dy) < 5) return false;
    if (!g.moved) box.current?.setPointerCapture(e.pointerId);
    g.moved = true;
    setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    return true;
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      pointers.current.set(e.pointerId, local(e));
      if (pointers.current.size === 1) gesture.current = null;
      start();
    },
    onPointerMove: (e: PointerEvent) => {
      const g = gesture.current;
      if (!pointers.current.has(e.pointerId) || !g) return;
      pointers.current.set(e.pointerId, local(e));
      const pts = [...pointers.current.values()];
      if (pts.length > 1) pinch(g, pts);
      else if (!pan(e, g, pts[0])) return;
      input.onTouch();
    },
    onPointerUp: (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size) start();
    },
    onPointerCancel: (e: PointerEvent) => void pointers.current.delete(e.pointerId),
    onClickCapture: (e: { stopPropagation: () => void }) => {
      if (!gesture.current?.moved) return;
      e.stopPropagation();
      gesture.current = null;
    },
  };
}
