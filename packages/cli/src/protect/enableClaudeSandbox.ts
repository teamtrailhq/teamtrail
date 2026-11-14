import { readSettings } from './readSettings';
import { writeSettings } from './writeSettings';

/**
 * Sets `sandbox.enabled: true` in `file`, keeping everything else there. A file it can't read as plain JSON, or
 * whose `sandbox` is something other than an object, is never rewritten.
 */
export function enableClaudeSandbox(file: string): 'enabled' | 'unchanged' | 'unreadable' {
  const settings = readSettings(file);
  if (!settings) return 'unreadable';
  const sandbox = settings.sandbox ?? {};
  if (typeof sandbox !== 'object' || sandbox === null || Array.isArray(sandbox)) return 'unreadable';
  if ((sandbox as Record<string, unknown>).enabled === true) return 'unchanged';
  writeSettings(file, { ...settings, sandbox: { ...sandbox, enabled: true } });
  return 'enabled';
}
