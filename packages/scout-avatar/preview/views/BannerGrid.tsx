import { useMemo } from 'react';
import { TICKETS, trailPath, walkedPoints } from './trailPath';

const INK = '#0A0A0B';
const BLAZE = '#FF6B2C';
const AHEAD = '#3A3D44';

/**
 * The banners' scene: a dot grid like the Lookout's map canvas, and the trail in square steps, blaze where it has
 * walked and a dashed line ahead, ticking off tickets on its way to the destination, the blaze dot of the logo and
 * wordmark (a ring until the trail reaches it). `progress` is how far the trail has walked.
 */
export function BannerGrid({ w, h, progress = 1 }: { w: number; h: number; progress?: number }) {
  const u = h / 640;
  const cell = 32 * u;
  const { points, along, length } = useMemo(() => trailPath(w, h), [w, h]);
  const walked = walkedPoints(w, h, progress);
  const [hx, hy] = walked[walked.length - 1];
  const [ex, ey] = points[points.length - 1];
  const arrived = progress >= 1;
  const line = (pts: [number, number][]) => pts.map((p) => p.join(',')).join(' ');
  return (
    <svg className="banner-grid" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <pattern id="banner-dots" width={cell} height={cell} patternUnits="userSpaceOnUse">
          <circle cx={cell / 2} cy={cell / 2} r={Math.max(0.8, 1.4 * u)} fill="#FFFFFF" fillOpacity="0.13" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#banner-dots)" />
      <polyline
        points={line(points)}
        fill="none"
        stroke={AHEAD}
        strokeWidth={Math.max(1.5, 3 * u)}
        strokeDasharray={`${8 * u} ${8 * u}`}
      />
      <polyline points={line(walked)} fill="none" stroke={BLAZE} strokeWidth={Math.max(2, 5 * u)} />
      {TICKETS.map((i) => {
        const done = progress * length >= along[i];
        const s = 22 * u;
        const [x, y] = points[i];
        return (
          <rect
            key={i}
            x={x - s / 2}
            y={y - s / 2}
            width={s}
            height={s}
            fill={done ? '#EDEDEF' : INK}
            stroke={done ? '#EDEDEF' : AHEAD}
            strokeWidth={3 * u}
          />
        );
      })}
      {arrived ? null : <rect x={hx - 6 * u} y={hy - 6 * u} width={12 * u} height={12 * u} fill={BLAZE} />}
      {arrived ? (
        <circle cx={ex} cy={ey} r={34 * u} fill="none" stroke={BLAZE} strokeOpacity="0.35" strokeWidth={2 * u} />
      ) : null}
      <circle cx={ex} cy={ey} r={20 * u} fill={arrived ? BLAZE : INK} stroke={BLAZE} strokeWidth={5 * u} />
    </svg>
  );
}
