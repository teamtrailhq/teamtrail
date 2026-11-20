import type { ReadinessCheck, ReadinessFinding } from '../model/readiness';
import type { RepoUnit } from '../model/repoProfile';
import { approvedChecks } from './approvedChecks';
import { folderLabel } from './folderLabel';
import type { ApprovedCheck, ReadinessInput } from './types';
import { unitChecked } from './unitChecked';

const MAX_UNIT_FINDINGS = 10;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i]);

/**
 * An approved check that is exactly one unit's command but runs in another folder (`npm test` at the top, written
 * for apps/web): it would test the wrong package. Only when exactly one folder has that command.
 */
function wrongFolder(input: ReadinessInput, check: ApprovedCheck): ReadinessFinding | undefined {
  const commands = input.profile.units.flatMap((u) => u.commands).filter((c) => same(c.run, check.run));
  const folders = [...new Set(commands.map((c) => c.cwd))];
  if (folders.length !== 1 || folders[0] === check.cwd) return undefined;
  const cwd = folders[0];
  return {
    id: `folder:${check.name}`,
    kind: 'folder',
    level: 'warns',
    unit: cwd,
    text: `${check.name} runs in ${folderLabel(check.cwd)}, but its command is ${folderLabel(cwd)}'s`,
    why: `${check.run.join(' ')} is in ${commands[0].from} in ${folderLabel(cwd)}`,
    checks: [check.name],
    fix: { kind: 'set-folder', check: check.name, cwd },
  };
}

/** The unit's suggested checks: the known ones, else its first, which then needs the person's acknowledgement. */
function suggestedFor(input: ReadinessInput, unit: RepoUnit, taken: Set<string>): ReadinessCheck[] {
  const mine = input.suggestions.filter((s) => s.cwd === unit.dir && !taken.has(s.name));
  const known = mine.filter((s) => s.known);
  const picked = known.length ? known : mine.slice(0, 1);
  return picked.map((s) => ({ name: s.name, run: s.run, cwd: s.cwd, known: s.known }));
}

/** Units with tests that no approved check runs, each with its suggested checks to add. */
function unchecked(input: ReadinessInput, checks: ApprovedCheck[]): ReadinessFinding[] {
  const taken = new Set(Object.keys(input.config?.checks ?? {}));
  const out: ReadinessFinding[] = [];
  for (const unit of input.profile.units) {
    if (out.length >= MAX_UNIT_FINDINGS) break;
    if (!unit.commands.some((c) => c.role === 'test') || unitChecked(unit, checks)) continue;
    const add = suggestedFor(input, unit, taken);
    out.push({
      id: `unit:${unit.dir}`,
      kind: 'unit',
      level: 'warns',
      unit: unit.dir,
      text: `No check runs ${folderLabel(unit.dir)}'s tests`,
      why: `${unit.manifest} in ${folderLabel(unit.dir)} has tests; no approved check runs there`,
      ...(add.length ? { fix: { kind: 'add-checks', checks: add } } : {}),
    });
  }
  return out;
}

/** Checks in the wrong folder, and units no check covers. Nothing while no check is approved (checkFindings.ts). */
export function coverageFindings(input: ReadinessInput): ReadinessFinding[] {
  const checks = approvedChecks(input.config);
  if (!checks.length) return [];
  const folders = checks.map((c) => wrongFolder(input, c)).filter((f): f is ReadinessFinding => !!f);
  return [...folders, ...unchecked(input, checks)];
}
