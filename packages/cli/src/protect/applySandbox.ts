import { claudeLocalSettings } from './claudeLocalSettings';
import { claudeSandboxState } from './claudeSandboxState';
import { enableClaudeSandbox } from './enableClaudeSandbox';
import type { SandboxChoice } from './sandboxChoice';

/** What `connect claude` did about Claude Code's sandbox; `file` is where it says so, or where it would. */
export type SandboxResult =
  | { kind: 'turned-on'; file: string }
  | { kind: 'already-on'; file: string }
  | { kind: 'left'; why: Exclude<SandboxChoice, 'on'>; file: string }
  | { kind: 'unreadable'; file: string };

/**
 * Carries out the person's choice in the project's `.claude/settings.local.json`, the file connect already writes
 * for this repo. A sandbox already on is left alone; a choice other than `on` changes nothing, an explicit
 * `sandbox.enabled: false` included.
 */
export function applySandbox(o: { cwd: string; choice: SandboxChoice }): SandboxResult {
  const file = claudeLocalSettings(o.cwd);
  const state = claudeSandboxState(o.cwd);
  if (state.kind === 'on') return { kind: 'already-on', file: state.file };
  if (o.choice !== 'on') return { kind: 'left', why: o.choice, file };
  const done = enableClaudeSandbox(file);
  if (done === 'unreadable') return { kind: 'unreadable', file };
  return { kind: 'turned-on', file };
}
