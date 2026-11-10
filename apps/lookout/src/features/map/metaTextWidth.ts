/** A 9.5px sentence-case character runs near 5px: the estimate where text can't be measured (tests). */
export const META_CHAR = 5;

const FONT = {
  sans: "9.5px 'Figtree Variable', system-ui, sans-serif",
  mono: "8.55px 'JetBrains Mono Variable', ui-monospace, monospace",
};
let ctx: CanvasRenderingContext2D | null | undefined;

function canvas() {
  if (ctx !== undefined) return ctx;
  try {
    ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  return ctx;
}

/** How wide a card's meta text draws, in map units: measured in the card's font, with a little air for medium weight. */
export function metaTextWidth(text: string, face: 'sans' | 'mono' = 'sans') {
  const c = canvas();
  if (!c) return text.length * META_CHAR;
  c.font = FONT[face];
  return c.measureText(text).width * 1.04;
}
