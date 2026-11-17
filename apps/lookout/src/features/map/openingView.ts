import { type LaidOutNode, NODE_H, NODE_W } from '@teamtrail/core';

/**
 * The smallest zoom the map opens at: card titles (11.5px) stay about 11px on screen. Fit still shows the whole
 * trail, smaller, when clicked.
 */
export const READABLE_ZOOM = 0.95;

type Box = { left: number; top: number; right: number; bottom: number };

/** What the map opens on: what needs you (most urgent first), else the work in progress, else what's ready next. */
function targets(nodes: LaidOutNode[], focus: string[]) {
  const byId = new Map(nodes.map((n) => [n.ticket.id, n]));
  const urgent = focus.map((id) => byId.get(id)).filter((n): n is LaidOutNode => !!n);
  const working = nodes.filter((n) => n.state === 'claimed' || n.state === 'verifying');
  const wanted = [...urgent, ...working.filter((n) => !urgent.includes(n))];
  if (wanted.length) return wanted;
  const ready = nodes.find((n) => n.state === 'frontier') ?? nodes[0];
  return ready ? [ready] : [];
}

function boxOf(nodes: LaidOutNode[], pad: number): Box {
  return {
    left: Math.min(...nodes.map((n) => n.x)) + pad,
    top: Math.min(...nodes.map((n) => n.y)) + pad,
    right: Math.max(...nodes.map((n) => n.x + NODE_W)) + pad,
    bottom: Math.max(...nodes.map((n) => n.y + NODE_H)) + pad,
  };
}

/**
 * How the map opens: the whole trail if it fits at a readable size, otherwise a readable zoom centred on what needs
 * you and the work in progress (as much of it as fits, the most urgent first). `room` keeps that much of the right
 * side free for the bubble, so it never covers the ticket it belongs to.
 */
export function openingView<V extends { k: number; x: number; y: number }>(input: {
  fit: V;
  nodes: LaidOutNode[];
  size: { w: number; h: number };
  pad: number;
  /** Tickets that need you, most urgent first. */
  focus?: string[];
  room?: number;
}): { k: number; x: number; y: number } {
  const { fit, nodes, size, pad } = input;
  if (fit.k >= READABLE_ZOOM) return fit;
  const all = targets(nodes, input.focus ?? []);
  if (!all.length) return fit;
  const k = READABLE_ZOOM;
  const w = Math.max(size.w / 2, size.w - (input.room ?? 0));
  const whole = boxOf(all, pad);
  const fits = (whole.right - whole.left) * k <= w - 32 && (whole.bottom - whole.top) * k <= size.h - 32;
  const b = fits ? whole : boxOf(all.slice(0, 1), pad);
  return {
    k,
    x: w / 2 - ((b.left + b.right) / 2) * k,
    y: size.h / 2 - ((b.top + b.bottom) / 2) * k,
  };
}
