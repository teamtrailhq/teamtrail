import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BRAND } from '@teamtrail/core';
import { configDir } from '@teamtrail/core/bridge';

/**
 * Where `p` really is: its real path, or, when it doesn't exist yet, the real path of its nearest existing parent with
 * the rest appended (a `~/.config` that is a symlink into a dotfiles repo, before Teamtrail has written anything).
 */
function realOf(p: string): string {
  const rest: string[] = [];
  for (let cur = p; ; cur = path.dirname(cur)) {
    try {
      return path.join(fs.realpathSync(cur), ...rest.reverse());
    } catch {
      if (path.dirname(cur) === cur) return p;
      rest.push(path.basename(cur));
    }
  }
}

/**
 * Teamtrail's config folder as an agent could name it: where Teamtrail resolves it ($TEAMTRAIL_CONFIG_DIR, else
 * XDG, else ~/.config/teamtrail), and its real path when a symlink leads there, since a rule on one spelling doesn't
 * cover the other. With a custom folder, the default ~/.config/teamtrail too: Teamtrail run without the variable
 * keeps its key there. It holds this machine's key (it signs the human's answers), the approvals and the tracker
 * credentials: nothing an agent needs.
 */
export function protectedDirs(dir: string = configDir()): string[] {
  const named = path.resolve(dir);
  // the default spot, for the HOME this process was given (os.homedir() can lag an env change inside one process)
  const fallback = path.join(process.env.HOME || os.homedir(), '.config', BRAND.slug);
  return [...new Set([named, realOf(named), fallback, realOf(fallback)])];
}
