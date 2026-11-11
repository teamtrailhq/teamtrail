import os from 'node:os';
import path from 'node:path';
import type { ConnectTarget } from '../connect';
import { claudeProtectionLines } from './claudeProtectionLines';
import { claudeSettingsFile } from './claudeSettingsFile';
import { codexProtectionLines } from './codexProtectionLines';
import { protectClaude } from './protectClaude';
import { protectedDirs } from './protectedDirs';

/**
 * `connect`'s last step: keep Teamtrail's config folder out of the agent's reach, in the agent's own settings
 * (claudeRules.ts, codexProtectionLines.ts). `enabled: false` is `--no-protect-config`.
 */
export function protectConfig(target: ConnectTarget, o: { print: (s: string) => void; enabled?: boolean }) {
  if (o.enabled === false) {
    o.print('  Config folder   not protected (--no-protect-config): the agent may read Teamtrail’s config folder');
    return;
  }
  const dirs = protectedDirs();
  if (process.platform === 'win32') {
    o.print(
      `  Config folder   not protected on Windows yet: keep ${dirs.join(' and ')} out of the agent's reach by hand`,
    );
    return;
  }
  const lines =
    target === 'claude'
      ? claudeProtectionLines(protectClaude(claudeSettingsFile(), dirs), dirs)
      : codexProtectionLines(dirs, process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
  for (const l of lines) o.print(l);
}
