import { setupProblem } from '../guides/setupArgv';
import type { SetupSpec } from '../model/setup';
import type { VerificationConfig } from '../model/verification';

const shown = (s: SetupSpec) => `${JSON.stringify(s.run)}${s.cwd && s.cwd !== '.' ? ` in ${s.cwd}` : ''}`;

/**
 * The setup steps approving would change, each as its exact argv (old → new), marked as setup so nobody takes one for a
 * check, and in the order they run when that changed.
 */
export function setupLines(before: VerificationConfig | undefined, after: VerificationConfig | undefined): string[] {
  const was = before?.setup ?? {};
  const now = after?.setup ?? {};
  const names = [...new Set([...Object.keys(was), ...Object.keys(now)])].sort();
  const lines = names.flatMap((name) => {
    const a = was[name];
    const b = now[name];
    if (a && b && shown(a) === shown(b)) return [];
    if (a && b) return [`setup ${name}: ${shown(a)} → ${shown(b)}`];
    return b ? [`+ setup ${name}: ${shown(b)}`] : [`- setup ${name}: ${shown(a!)}`];
  });
  const order = (s: Record<string, SetupSpec>) => Object.keys(s).join(', ');
  if (before && after && order(was) !== order(now) && Object.keys(was).length && Object.keys(now).length)
    lines.push(`setup runs in this order: ${order(was)} → ${order(now)}`);
  return lines;
}

/** Setup steps Teamtrail won't run as written (setupArgv.ts): approving doesn't change that. */
export function setupWarnings(after: VerificationConfig | undefined): string[] {
  return Object.entries(after?.setup ?? {}).flatMap(([name, spec]) => {
    const problem = setupProblem(spec);
    return problem ? [`setup ${name} won't run: ${problem}`] : [];
  });
}
