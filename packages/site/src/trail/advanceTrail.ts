import { type Trail } from './fieldTypes';

/** Moves one trail on by `dt` ms: grows, holds while its pulse runs, then fades or retracts. */
export function advanceTrail(t: Trail, o: { now: number; dt: number; rand: () => number }) {
  const s = o.dt / 1000;
  if (t.phase === 'grow') {
    t.head = Math.min(t.len, t.head + t.speed * s);
    if (t.head < t.len) return;
    t.phase = 'hold';
    t.pulse = 0;
    t.until = o.now + (t.len / 240) * 1000 + 900 + o.rand() * 1600;
    return;
  }
  if (t.phase === 'hold') {
    if (t.pulse !== null) t.pulse += 240 * s;
    if (t.pulse !== null && t.pulse > t.len + 60) t.pulse = null;
    if (o.now >= t.until) t.phase = t.exit;
    return;
  }
  if (t.phase === 'fade') t.alpha = Math.max(0, t.alpha - s / 1.6);
  else t.tail = Math.min(t.len, t.tail + t.speed * s);
}
