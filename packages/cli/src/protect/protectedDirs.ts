import fs from 'node:fs';
import path from 'node:path';
import { configDir } from '@teamtrail/core/bridge';

/**
 * Teamtrail's config folder as an agent could name it: where Teamtrail resolves it ($TEAMTRAIL_CONFIG_DIR, else
 * XDG, else ~/.config/teamtrail), and its real path too when a symlink leads there, since a rule on one spelling
 * doesn't cover the other. It holds this machine's key (it signs the human's answers), the approvals and the
 * tracker credentials: nothing an agent needs.
 */
export function protectedDirs(dir: string = configDir()): string[] {
  const named = path.resolve(dir);
  let real = named;
  try {
    real = fs.realpathSync(named);
  } catch {
    // Not created yet: the folder is named as it will be.
  }
  return [...new Set([named, real])];
}
