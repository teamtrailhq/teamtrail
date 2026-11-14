import { readSettings } from './readSettings';
import { writeSettings } from './writeSettings';

/**
 * Sets `sandbox.enabled: true` in `file`, keeping everything else there. A file it can't read as plain JSON, or
 * whose `sandbox` is something other than an object, is never rewritten. Unless the file already says otherwise it
 * also sets `autoAllowBashIfSandboxed: false`, so turning the sandbox on never stops Claude Code asking before it
 * runs a command: the person's permission prompts stay as they were.
 */
export function enableClaudeSandbox(file: string): 'enabled' | 'unchanged' | 'unreadable' {
  const settings = readSettings(file);
  if (!settings) return 'unreadable';
  const sandbox = settings.sandbox ?? {};
  if (typeof sandbox !== 'object' || sandbox === null || Array.isArray(sandbox)) return 'unreadable';
  const current = sandbox as Record<string, unknown>;
  if (current.enabled === true) return 'unchanged';
  const prompts = typeof current.autoAllowBashIfSandboxed === 'boolean' ? {} : { autoAllowBashIfSandboxed: false };
  writeSettings(file, { ...settings, sandbox: { ...current, enabled: true, ...prompts } });
  return 'enabled';
}
