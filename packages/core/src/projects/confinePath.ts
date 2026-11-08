import { realpathSync } from 'node:fs';
import path from 'node:path';

/** The deepest part of `p` that exists, resolved through symlinks, plus the rest as written. */
function realOrParent(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    if (parent === p) return p;
    return path.join(realOrParent(parent), path.basename(p));
  }
}

/**
 * Whether a tracker-relative path stays inside `root` once `..` and symlinks are resolved. File routes of
 * other projects check this, so a link inside one repo can't reach files outside it.
 */
export function insideRoot(root: string, rel: string): boolean {
  if (path.isAbsolute(rel) || rel.includes('\0')) return false;
  const base = realOrParent(path.resolve(root));
  const full = realOrParent(path.resolve(root, rel));
  return full === base || full.startsWith(base + path.sep);
}
