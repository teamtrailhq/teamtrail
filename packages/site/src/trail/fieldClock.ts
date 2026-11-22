/**
 * Runs `frame` on every animation frame while `wanted()` says so, with the ms since the last one (at most 50, so a
 * tab coming back doesn't jump). `stop` and `run` pause and resume it.
 */
export function fieldClock(o: { frame: (now: number, dt: number) => void; wanted: () => boolean }) {
  let raf = 0;
  let last = 0;
  const tick = (now: number) => {
    const dt = Math.min(50, now - (last || now));
    last = now;
    o.frame(now, dt);
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };
  const run = () => {
    if (raf || !o.wanted()) return;
    raf = requestAnimationFrame(tick);
  };
  return { run, stop };
}
