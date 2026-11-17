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
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const { nodes, pad, view, setView, onFocus } = latest.current;
    const n = selId ? nodes.find((x) => x.ticket.id === selId) : undefined;
    if (!n || !size.w) return;
    onFocus();
    const k = Math.min(1.4, Math.max(view.k, 1.05));
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
  }, [selId]);
}
