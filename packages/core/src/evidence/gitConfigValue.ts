import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { gitEnv, SAFE_CONFIG } from './safeGit';

/**
 * One git config value (`user.name`, `user.email`), read synchronously for the few callers that can't wait,
 * with the same scrubbed environment and overrides as git.ts. Reading config runs no filter, so the filter
 * listing git.ts does first isn't needed. Undefined when git has none, or isn't there.
 */
export function gitConfigValue(cwd: string, key: string): string | undefined {
  const r = spawnSync('git', ['config', '--get', '--end-of-options', key], {
    cwd: existsSync(cwd) ? cwd : undefined,
    encoding: 'utf8',
    timeout: 2000,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
    env: gitEnv(SAFE_CONFIG),
  });
  const value = r.status === 0 ? r.stdout.trim() : '';
  return value || undefined;
}
