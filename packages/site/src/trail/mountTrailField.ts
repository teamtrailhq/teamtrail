import { advanceTrail } from './advanceTrail';
import { fieldClock } from './fieldClock';
import { fieldGeometry } from './fieldGeometry';
import { type Geometry, type Trail, type TrailFieldOptions } from './fieldTypes';
import { liveOf } from './liveOf';
import { paintTrail } from './paintTrail';
import { readPalette } from './readPalette';
import { seeded } from './seeded';
import { walk } from './walk';

const SEED = 0x7e2a11;
const WIDE = 1100;
/** At most this many trails grow at once, so little moves at the edge of sight. */
const GROWING = 2;

const done = (t: Trail) => (t.phase === 'fade' && t.alpha <= 0) || (t.phase === 'retract' && t.tail >= t.len);

/**
 * The trail field, on wide screens: faint trails that keep growing in the margins around a page's content. Each
 * one draws itself on the dot grid at a walking pace, holds while a pulse runs along it, then fades or retracts,
 * and another starts elsewhere on another route. Routes come from a seeded walk (walk.ts), so a page load always
 * plays the same; they keep clear of the content, measured from the page and again on every resize. With reduced
 * motion it is a still set of trails, drawn once. Without scripts there is no field; the page is complete without
 * it. Paused while off screen. Styles: `.site-trail-field` in tokens.css.
 */
export function mountTrailField(o: TrailFieldOptions) {
  const canvas = document.createElement('canvas');
  canvas.className = 'site-trail-field';
  canvas.setAttribute('aria-hidden', 'true');
  o.host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let palette = readPalette(o.strength);
  let geo: Geometry | null = null;
  let rand = seeded(SEED);
  let trails: Trail[] = [];
  const taken = new Set<string>();
  let nextSpawn = 0;
  let visible = true;

  const draw = () => {
    if (!geo) return;
    ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
    ctx.clearRect(0, 0, geo.width, geo.height);
    for (const t of trails) paintTrail(ctx, t, palette);
  };

  const spawn = (now: number, grown: boolean) => {
    if (!geo) return;
    const route = walk({ rand, area: geo.area, blocked: geo.blocked, taken, grid: geo.grid, exits: geo.exits });
    if (!route) return;
    for (const c of route.cells) taken.add(c);
    const live = liveOf(route);
    const speed = 120 + rand() * 80;
    const exit = rand() < 0.5 ? 'fade' : 'retract';
    trails.push({ ...live, head: grown ? live.len : 0, phase: grown ? 'hold' : 'grow', speed, exit, until: now });
  };

  const step = (now: number, dt: number) => {
    for (const t of trails) advanceTrail(t, { now, dt, rand });
    for (const t of trails.filter(done)) for (const c of t.route.cells) taken.delete(c);
    trails = trails.filter((t) => !done(t));
    const growing = trails.filter((t) => t.phase === 'grow').length;
    if (!geo || trails.length >= geo.target || growing >= GROWING || now < nextSpawn) return;
    spawn(now, false);
    nextSpawn = now + 900 + rand() * 2600;
  };

  const clock = fieldClock({
    frame: (now, dt) => {
      step(now, dt);
      draw();
    },
    wanted: () => !o.reducedMotion && geo !== null && visible,
  });

  const layout = () => {
    clock.stop();
    const wide = window.innerWidth >= WIDE;
    canvas.classList.toggle('is-off', !wide);
    geo = wide ? fieldGeometry(o, canvas) : null;
    trails = [];
    taken.clear();
    rand = seeded(SEED);
    if (!geo) return;
    canvas.style.top = `${geo.top}px`;
    canvas.style.height = `${geo.height}px`;
    canvas.width = Math.round(geo.width * geo.dpr);
    canvas.height = Math.round(geo.height * geo.dpr);
    if (o.reducedMotion) {
      for (let i = 0; i < geo.target + 1; i++) spawn(0, true);
      for (const t of trails) t.pulse = null;
      draw();
      return;
    }
    nextSpawn = performance.now() + 1200;
    clock.run();
  };

  let pending = 0;
  const relayout = () => {
    window.clearTimeout(pending);
    pending = window.setTimeout(layout, 150);
  };
  window.addEventListener('resize', relayout);
  const sized = new ResizeObserver(relayout);
  for (const el of o.watch ?? []) sized.observe(el);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) clock.run();
    else clock.stop();
  }).observe(canvas);
  o.theme.onChange(() => {
    palette = readPalette(o.strength);
    draw();
  });
  void document.fonts?.ready.then(relayout);
  layout();
}
