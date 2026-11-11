import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';
import { BRAND } from '../model/brand';
import { configDir } from '../server/trackerConfig';

/**
 * Why Teamtrail can't use its config folder on this machine, or undefined when it can. Approvals, the answer key and
 * the tracker queue live there; an agent's sandbox often blocks `~/.config`, and then nothing in it can be read or
 * written. Callers fail closed with this message instead of a confusing "not approved" or a crash.
 */
export function machineAccess(dir: string = configDir()): string | undefined {
  let probe = dir;
  while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  try {
    accessSync(probe, constants.R_OK | constants.W_OK | constants.X_OK);
    return undefined;
  } catch {
    return `${BRAND.name} can't read its config folder ${dir}; your agent's sandbox may block it. Approvals, answers and queued tracker writes are kept there, so nothing that needs them goes through until it can.`;
  }
}
