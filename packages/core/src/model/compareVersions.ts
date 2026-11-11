/** Orders two `x.y.z` versions (a prerelease suffix is ignored): negative when `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .split('-')[0]
      .split('.')
      .map((n) => Number(n) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
