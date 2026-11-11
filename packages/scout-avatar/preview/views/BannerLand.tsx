import { useMemo } from 'react';

const LEVELS = [-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8];
const PINE = 'M9 0l6 9h-3l5 7h-3l5 8H10v5H8v-5H-1l5-8H1l5-7H3z';
/** Pines as [x fraction, height]: which ridge they stand on is worked out from x. */
const PINES = [
  [0.03, 74],
  [0.07, 52],
  [0.11, 88],
  [0.16, 60],
  [0.21, 44],
  [0.3, 38],
  [0.62, 40],
  [0.69, 58],
  [0.74, 46],
  [0.8, 82],
  [0.85, 56],
  [0.9, 92],
  [0.96, 64],
];
const MARKERS = [0.14, 0.32, 0.5, 0.68, 0.84];

function contourPath(w: number, h: number, wobble: number) {
  const cell = 20;
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const field = (i: number, j: number) => {
    const a = ((i * cell) / w) * 6;
    const b = ((j * cell) / h) * 4;
    return (
      Math.sin(a + wobble) +
      Math.sin(b * 1.3 - wobble + a * 0.4) +
      0.6 * Math.sin(a * 1.9 - b * 1.4 + wobble) +
      0.4 * Math.cos(b * 2.6 + a * 0.8 - wobble)
    );
  };
  let d = '';
  for (const level of LEVELS) {
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const [p, q, r, s] = [field(i, j), field(i + 1, j), field(i + 1, j + 1), field(i, j + 1)];
        const [x, y] = [i * cell, j * cell];
        const hits: [number, number][] = [];
        if (p < level !== q < level) hits.push([x + (cell * (level - p)) / (q - p), y]);
        if (q < level !== r < level) hits.push([x + cell, y + (cell * (level - q)) / (r - q)]);
        if (s < level !== r < level) hits.push([x + (cell * (level - s)) / (r - s), y + cell]);
        if (p < level !== s < level) hits.push([x, y + (cell * (level - p)) / (s - p)]);
        if (hits.length >= 2)
          d += `M${hits[0][0].toFixed(1)} ${hits[0][1].toFixed(1)}L${hits[1][0].toFixed(1)} ${hits[1][1].toFixed(1)}`;
      }
    }
  }
  return d;
}

const ridge = (x: number, seed: number) =>
  0.5 * (1 - Math.abs(Math.sin(x * 2.1 + seed))) + 0.3 * (1 - Math.abs(Math.sin(x * 5.3 + seed * 1.7))) + 0.2;

function ridgePath(w: number, h: number, base: number, amp: number, seed: number) {
  const top = (x: number) => h - h * (base + amp * ridge((x / w) * 3, seed));
  let d = `M0 ${h}`;
  for (let x = 0; x <= w + 8; x += 8) d += `L${x} ${top(x).toFixed(1)}`;
  return { d: `${d}L${w} ${h}Z`, top };
}

/** Where the dashed trail runs: across the near ridge and up to its destination. */
function trailPoint(w: number, h: number, t: number): [number, number] {
  const x = w * (0.02 + 0.93 * t);
  const y = h * (0.9 - 0.1 * Math.sin(t * 7) * (1 - t * 0.4) - 0.1 * t ** 5);
  return [x, y];
}

/**
 * The banners' scene, like the site's hero: contour lines over layered ridges and pines, and the dashed trail
 * ticking off tickets on its way to the destination: the orange dot of the logo and wordmark, a ring until the trail reaches it. `progress` is how far the trail has walked, `wobble` moves the contours.
 */
export function BannerLand({
  w,
  h,
  progress = 1,
  wobble = 0,
}: {
  w: number;
  h: number;
  progress?: number;
  wobble?: number;
}) {
  const u = h / 640;
  const contours = useMemo(() => contourPath(w, h, wobble), [w, h, wobble]);
  const [far, mid, near] = useMemo(
    () => [ridgePath(w, h, 0.1, 0.44, 1.2), ridgePath(w, h, 0.06, 0.26, 3.7), ridgePath(w, h, 0.03, 0.14, 6.1)],
    [w, h],
  );
  const steps = 90;
  const walked = Array.from({ length: Math.round(steps * progress) + 1 }, (_, i) => trailPoint(w, h, i / steps));
  const [hx, hy] = walked[walked.length - 1];
  const [ex, ey] = trailPoint(w, h, 1);
  return (
    <svg className="banner-land" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={contours} fill="none" stroke="#8fbf84" strokeOpacity="0.2" strokeWidth={Math.max(1, 1.2 * u)} />
      <path d={far.d} fill="#1b2c26" />
      <path d={mid.d} fill="#223a2e" />
      {PINES.map(([x, tall]) => (
        <svg
          key={x}
          x={x * w - (tall * u * 0.73) / 2}
          y={mid.top(x * w) - tall * u + 4 * u}
          width={tall * u * 0.73}
          height={tall * u}
          viewBox="-2 0 22 30"
        >
          <path d={PINE} fill="#2c4a39" />
        </svg>
      ))}
      <path d={near.d} fill="#2c4a39" />
      <polyline
        points={walked.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="#e8833a"
        strokeWidth={Math.max(2, 5 * u)}
        strokeLinecap="round"
        strokeDasharray={`${14 * u} ${12 * u}`}
      />
      {MARKERS.map((m) => {
        const [x, y] = trailPoint(w, h, m);
        const s = 18 * u;
        return (
          <rect
            key={m}
            x={x - s / 2}
            y={y - s / 2}
            width={s}
            height={s}
            fill={progress >= m ? '#8fbf84' : '#101815'}
            stroke="#8fbf84"
            strokeWidth={3 * u}
          />
        );
      })}
      {progress < 1 && <circle cx={hx} cy={hy} r={9 * u} fill="#e8833a" />}
      <circle
        cx={ex}
        cy={ey}
        r={20 * u}
        fill={progress >= 1 ? '#e8833a' : '#101815'}
        stroke="#e8833a"
        strokeWidth={5 * u}
      />
    </svg>
  );
}
