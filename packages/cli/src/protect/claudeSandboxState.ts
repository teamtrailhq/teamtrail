import path from 'node:path';
import { claudeLocalSettings } from './claudeLocalSettings';
import { claudeSettingsFile } from './claudeSettingsFile';
import { readSettings } from './readSettings';

/** Whether Claude Code's sandbox is on for this project, and the file that says so. */
export type ClaudeSandboxState = { kind: 'on'; file: string } | { kind: 'off'; file: string } | { kind: 'unset' };

function enabledIn(file: string): boolean | undefined {
  const sandbox = readSettings(file)?.sandbox;
  if (typeof sandbox !== 'object' || sandbox === null) return undefined;
  const enabled = (sandbox as Record<string, unknown>).enabled;
  return typeof enabled === 'boolean' ? enabled : undefined;
}

/**
 * `sandbox.enabled` as Claude Code reads it for the project in `cwd`: the local settings win over the shared
 * project settings, which win over the user's. A file it can't read says nothing.
 */
export function claudeSandboxState(cwd: string, env: NodeJS.ProcessEnv = process.env): ClaudeSandboxState {
  const files = [claudeLocalSettings(cwd), path.join(cwd, '.claude', 'settings.json'), claudeSettingsFile(env)];
  for (const file of files) {
    const enabled = enabledIn(file);
    if (enabled === undefined) continue;
    return enabled ? { kind: 'on', file } : { kind: 'off', file };
  }
  return { kind: 'unset' };
}
