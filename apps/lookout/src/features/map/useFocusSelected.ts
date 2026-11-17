import { NODE_H, NODE_W } from '@teamtrail/core';
import { useEffect, useRef } from 'react';

type View = { k: number; x: number; y: number };
type Node = { ticket: { id: string }; x: number; y: number };

const MS = 380;

/**
 * When a ticket is selected (on the map, or opened from the inbox or a decision), glide the map to
 * centre it and zoom to a readable level, never further out than the current view.
 */
export function useFocusSelected(opts: {
  selId: string | undefined;
  nodes: Node[];
  size: { w: number; h: number };
  pad: number;
  view: View;
  setView: (v: View) => void;
  onFocus: () => void;
}) {
  const { selId, size } = opts;
  const latest = useRef(opts);
  latest.current = opts;
  /** The ticket the map last moved to: a selection made before the map had its size moves it once it has. */
  const focused = useRef<string>();
  const ready = size.w > 0;
  useEffect(() => {
    if (!selId) focused.current = undefined;
    const { nodes, pad, view, setView, onFocus } = latest.current;
    const n = selId ? nodes.find((x) => x.ticket.id === selId) : undefined;
    if (!n || !ready || focused.current === selId) return;
    focused.current = selId;
    // a card already in view, readable and with room beside it for its bubble, stays where it is
    if (readableInView({ n, pad, view, size })) return;
    onFocus();
    const k = Math.min(1.4, Math.max(view.k, 0.9));
    // with room for the bubble beside it, the ticket sits left of centre
    const at = size.w > 900 ? size.w * 0.34 : size.w / 2;
    const to = {
      k,
      x: at - (pad + n.x + NODE_W / 2) * k,
      y: size.h / 2 - (pad + n.y + NODE_H / 2) * k,
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setView(to);
    const from = view;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / MS);
      const e = 1 - (1 - t) ** 3;
      setView({ k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Only a new selection moves the map; layout and size changes keep the user's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, ready]);
}

/** The card is readable at this zoom and wholly inside the box, clear of its edges. */
function readableInView(o: { n: Node; pad: number; view: View; size: { w: number; h: number } }) {
  const { n, pad, view, size } = o;
  const left = view.x + (pad + n.x) * view.k;
  const top = view.y + (pad + n.y) * view.k;
  const right = left + NODE_W * view.k;
  const bottom = top + NODE_H * view.k;
  return view.k >= 0.72 && left >= 16 && top >= 16 && right <= size.w - 16 && bottom <= size.h - 16;
}
