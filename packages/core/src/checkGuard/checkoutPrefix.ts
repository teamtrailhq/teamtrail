import { realpathSync } from 'node:fs';
import path from 'node:path';

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** Where the checkout the checks ran in sits inside the git worktree: '' when they're the same folder. */
export function checkoutPrefix(toplevel: string, checkout: string) {
  const rel = path.relative(real(toplevel), real(checkout)).split(path.sep).join('/');
  return rel.startsWith('..') || path.isAbsolute(rel) ? '' : rel;
}
