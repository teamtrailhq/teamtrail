import { checkEnvNames } from './checkEnvNames';

/**
 * The names a project's checks may read on this machine beyond the allowlist (checkEnvNames.ts), for the commands
 * Teamtrail starts for it; none when the machine store can't be read (a sandbox that blocks the config dir).
 */
export function storedCheckEnvNames(root: string): string[] {
  try {
    return checkEnvNames(root).names();
  } catch {
    return [];
  }
}
