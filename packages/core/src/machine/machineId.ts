import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';

/** The real path of a folder as the file system spells it (case included), or its resolved path when it's gone. */
function canonical(root: string): string {
  try {
    return realpathSync.native(root);
  } catch {
    return path.resolve(root);
  }
}

/**
 * The machine store's key for a tracker folder: the full sha256 of its real path, as the file system spells it, so
 * `cd repo` and `cd Repo` on a case-insensitive disk name the same project. A repo that moves gets a new id.
 */
export const machineId = (root: string) => createHash('sha256').update(canonical(root)).digest('hex');
