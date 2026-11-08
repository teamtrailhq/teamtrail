/** Where the map is: zoom `k` and the offset of its top left corner. */
export type View = { k: number; x: number; y: number };

/** `v` zoomed to `k` (clamped to 0.2–3) around point `p`, which stays put on screen. */
export function zoomAt(v: View, k: number, p: { x: number; y: number }): View {
  const nk = Math.min(3, Math.max(0.2, k));
  return { k: nk, x: p.x - ((p.x - v.x) * nk) / v.k, y: p.y - ((p.y - v.y) * nk) / v.k };
}
