const STOP = new Set(
  'the and for with that this from into what which when where should would could does have will are not but you your our use using about there their than then them they these those how why who can its also any all only'.split(
    ' ',
  ),
);

const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .split(/[^a-z0-9$%]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );

/** How much two texts' wording overlaps: shared words over the smaller text's words, 0–1. Deterministic, no model. */
export function wordOverlap(a: string, b: string): number {
  const [x, y] = [words(a), words(b)];
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / Math.min(x.size, y.size);
}
