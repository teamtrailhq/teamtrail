/** How long ago, in the largest whole unit: `5m`, `3h`, `2d`. */
export function ago(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
