import { lstatSync } from 'node:fs';
import path from 'node:path';

/**
 * Whether no part of `rel` under `root` that exists is a symbolic link. A write goes to the file named, never
 * through a link someone committed (`trail/tickets/1.md` → `~/.ssh/authorized_keys`); insideRoot.ts confines
 * reads, and this keeps writes from following a link at all, even one that points inside.
 */
export function symlinkFree(root: string, rel: string): boolean {
  let at = path.resolve(root);
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    at = path.join(at, part);
    try {
      if (lstatSync(at).isSymbolicLink()) return false;
    } catch {
      return true;
    }
  }
  return true;
}
