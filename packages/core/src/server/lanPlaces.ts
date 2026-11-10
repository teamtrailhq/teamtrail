import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '../model/brand';

function real(p: string) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * The folders whose paths another device never gets to read: the project (its repo, and the repo's parent,
 * where claim worktrees live), the home folder, the temp folder and the user config dir, each also as the path
 * its symlinks resolve to (`/var/folders` is `/private/var/folders` on macOS).
 */
export function lanPlaces(root: string, configDir?: string): string[] {
  const repo = path.basename(root) === BRAND.dataDir ? path.dirname(root) : root;
  const named = [root, repo, path.dirname(repo), os.homedir(), os.tmpdir(), configDir].filter((p): p is string => !!p);
  const temp = process.platform === 'win32' ? [] : ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders'];
  return [...new Set([...named, ...named.map(real), ...temp])].filter((p) => path.dirname(p) !== p);
}
