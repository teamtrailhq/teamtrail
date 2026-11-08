import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/** The real path of a folder, or its resolved path when it doesn't exist (a removed repo keeps its id). */
export function realRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return path.resolve(root);
  }
}

/** A short stable id for a tracker folder: a hash of its real path, so symlinks and `..` agree. */
export function projectId(root: string): string {
  return createHash('sha256').update(realRoot(root)).digest('hex').slice(0, 10);
}
