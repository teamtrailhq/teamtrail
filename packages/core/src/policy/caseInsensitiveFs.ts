import { statSync } from 'node:fs';

const swapCase = (s: string) =>
  s.replace(/[a-zA-Z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));

const known = new Map<string, boolean>();

/**
 * Whether `dir` is on a filesystem that takes `Infra/x` and `infra/x` for the same file (macOS and Windows by
 * default). There a path rule has to match whatever the case, or `INFRA/x` walks past `infra/**`. Found by
 * asking for the folder under its name with the case of every letter swapped: the same inode means the same file.
 */
export function caseInsensitiveFs(dir: string): boolean {
  const cached = known.get(dir);
  if (cached !== undefined) return cached;
  const swapped = swapCase(dir);
  let same = false;
  try {
    const a = statSync(dir);
    const b = statSync(swapped);
    same = swapped !== dir && a.ino === b.ino && a.dev === b.dev;
  } catch {
    same = false;
  }
  known.set(dir, same);
  return same;
}
