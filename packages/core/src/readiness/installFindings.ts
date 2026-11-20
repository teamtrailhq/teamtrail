import { setupProblem } from '../guides/setupArgv';
import type { ReadinessFinding } from '../model/readiness';
import type { RepoUnit } from '../model/repoProfile';
import { approvedChecks } from './approvedChecks';
import { dependencyFolder } from './dependencyFolder';
import { folderLabel } from './folderLabel';
import { insideFolder } from './insideFolder';
import { setupStepName } from './setupStepName';
import type { ReadinessInput } from './types';

const shellWord = (w: string) => (/^[\w./@:=+-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`);
const commandIn = (dir: string, run: string[]) => `${dir ? `cd ${shellWord(dir)} && ` : ''}${run.map(shellWord).join(' ')}`;

/** The approved setup step that installs this unit, if one does (same folder, same program). */
function setupFor(input: ReadinessInput, unit: RepoUnit) {
  const steps = Object.entries(input.config?.setup ?? {});
  return steps.find(([, s]) => (s.cwd ?? '') === unit.dir && s.run[0] === unit.install?.[0])?.[0];
}

/** The checks that run in the unit or in a workspace member it installs. */
function checksIn(input: ReadinessInput, unit: RepoUnit) {
  const members = input.profile.units.filter((u) => u.memberOf === unit.dir).map((u) => u.dir);
  const dirs = [unit.dir, ...members];
  return approvedChecks(input.config)
    .filter((c) => dirs.some((d) => insideFolder(c.cwd, d)))
    .map((c) => c.name);
}

/** One install root whose dependencies aren't here. */
function notInstalled(input: ReadinessInput, unit: RepoUnit): ReadinessFinding {
  const where = folderLabel(unit.dir);
  const step = setupFor(input, unit);
  const checks = checksIn(input, unit);
  const why = `no ${dependencyFolder(unit)?.[0]} next to ${unit.lockfile} in ${where}`;
  const howTo = unit.install ? [commandIn(unit.dir, unit.install)] : [];
  const base = { id: `install:${unit.dir}`, kind: 'install' as const, unit: unit.dir, why, howTo };
  const stops = checks.length ? { checks } : {};
  if (step)
    return {
      ...base,
      ...stops,
      level: 'info',
      text: `Dependencies aren't installed in ${where} in your checkout; the setup step ${step} installs them where Teamtrail prepares worktrees`,
    };
  const spec = unit.install && { run: unit.install, cwd: unit.dir };
  const canAdd = spec && !setupProblem(spec);
  const name = setupStepName(unit.dir, Object.keys(input.config?.setup ?? {}));
  return {
    ...base,
    ...stops,
    level: 'warns',
    text: `Dependencies aren't installed in ${where}`,
    ...(canAdd ? { fix: { kind: 'add-setup', name, run: spec.run, cwd: spec.cwd } } : {}),
  };
}

/** Screening's own word that a check's program or package isn't installed, where no install finding says it. */
function screenedInstalls(input: ReadinessInput, said: Set<string>): ReadinessFinding[] {
  return input.screening
    .filter((f) => f.cause === 'not-installed' && !said.has(f.check))
    .map((f) => ({
      id: `check:${f.check}:install`,
      kind: 'install' as const,
      level: 'warns' as const,
      text: `${f.check}: ${f.text}`,
      why: 'read from the repo before anything ran',
      checks: [f.check],
    }));
}

/**
 * Install roots whose dependency folder isn't in the checkout (local only, probeLocal.ts), with the frozen install to
 * copy and, when no approved setup step installs them, that step to add. Teamtrail never installs into the person's
 * own checkout: a setup step runs only in the worktrees it prepares. A check screening says isn't installed is folded in.
 */
export function installFindings(input: ReadinessInput): ReadinessFinding[] {
  const probes = input.probes;
  if (!probes) return [];
  const units = input.profile.units.filter((u) => probes.installed[u.dir] === false);
  const found = units.map((u) => notInstalled(input, u));
  const said = new Set(found.flatMap((f) => f.checks ?? []));
  return [...found, ...screenedInstalls(input, said)];
}
