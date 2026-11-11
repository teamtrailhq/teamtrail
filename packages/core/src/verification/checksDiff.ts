import { checkArgv, checkNotice } from '../guides/checkArgv';
import type { CheckSpec, VerificationConfig } from '../model/verification';
import { parseVerificationConfig } from './config';

const argv = (s: CheckSpec) => JSON.stringify(s.run);
const where = (s: CheckSpec) => (s.cwd && s.cwd !== '.' ? ` in ${s.cwd}` : '');
const shown = (s: CheckSpec) => `${argv(s)}${where(s)}`;
const config = (text: string | undefined) => (text ? parseVerificationConfig(text).config : undefined);

/** Settings besides the commands, each as one comparable line. */
function settings(c: VerificationConfig): Record<string, string> {
  return {
    'runs on every completion': c.run.join(', ') || 'nothing',
    'applies to': c.appliesTo.join(', ') || 'no ticket types',
    'new trails start at': c.default,
    'attempts before it waits for you': String(c.maxAttempts),
    'a completion without changes': `${c.noChanges.else} (allowed for ${c.noChanges.allow.join(', ') || 'none'})`,
    'stops at the first failure': String(c.failFast),
    'a pass on code that changed': c.stale,
    'required GitHub checks': c.github.requiredChecks.join(', ') || 'none',
  };
}

function commandLines(before: VerificationConfig | undefined, after: VerificationConfig | undefined): string[] {
  const names = [...new Set([...Object.keys(before?.checks ?? {}), ...Object.keys(after?.checks ?? {})])].sort();
  return names.flatMap((name) => {
    const was = before?.checks[name];
    const now = after?.checks[name];
    if (was && now && shown(was) === shown(now)) return [];
    if (was && now) return [`${name}: ${shown(was)} → ${shown(now)}`];
    return now ? [`+ ${name}: ${shown(now)}`] : [`- ${name}: ${shown(was!)}`];
  });
}

function settingLines(before: VerificationConfig | undefined, after: VerificationConfig | undefined): string[] {
  if (!before || !after) return [];
  const was = settings(before);
  const now = settings(after);
  return Object.keys(now)
    .filter((k) => was[k] !== now[k])
    .map((k) => `${k}: ${was[k]} → ${now[k]}`);
}

/**
 * What approving verification.json now would change, against the approved content: each command as its exact
 * argv (old → new), then the other settings that differ. With nothing approved yet, every command it would run.
 * `warnings` are the guide lint's argv rules, as advice: the trail lead may still approve their own commands.
 */
export function checksDiff(approved: string | undefined, current: string | undefined) {
  const before = config(approved);
  const after = config(current);
  const lines = [...commandLines(before, after), ...settingLines(before, after)];
  if (current === undefined) lines.unshift('the file was deleted: no check would run');
  else if (!after) lines.push('the file has errors: completions that need checks would wait for you');
  else if (!lines.length && !before) lines.push('no check commands yet: approving lets you add them from guides');
  else if (!lines.length) lines.push('the same commands and settings, written differently');
  const checks = Object.entries(after?.checks ?? {});
  const warnings = checks.flatMap(([name, spec]) => checkArgv(spec).map((problem) => `${name} ${problem}`));
  const unknown = checks.flatMap(([name, spec]) => {
    const notice = checkNotice(spec);
    return notice ? [`${name}: ${notice}`] : [];
  });
  return { lines, warnings: [...warnings, ...unknown], unknown: unknown.length > 0 };
}
