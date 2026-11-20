import type { ReadinessFinding, ReadinessNeed, UnitReadiness } from '../model/readiness';
import type { RepoUnit } from '../model/repoProfile';
import { approvedChecks } from './approvedChecks';
import { toolchainProgram } from './toolchainProgram';
import type { ReadinessInput } from './types';
import { unitChecked } from './unitChecked';

type Need = ReadinessNeed;

/** `need` met, or not met with the finding that says why. */
function need(o: { kind: Need['kind']; label: string; finding?: ReadinessFinding }): Need {
  return o.finding
    ? { kind: o.kind, label: o.label, ok: false, finding: o.finding.id }
    : { kind: o.kind, label: o.label, ok: true };
}

function checkNeed(input: ReadinessInput, unit: RepoUnit, byId: Map<string, ReadinessFinding>): Need | undefined {
  if (!unit.commands.some((c) => c.role === 'test')) return undefined;
  const checks = approvedChecks(input.config);
  const covering = unitChecked(unit, checks);
  if (covering) return need({ kind: 'unit', label: `checked by ${covering.name}` });
  const finding = byId.get(`unit:${unit.dir}`) ?? byId.get('checks-none') ?? byId.get('checks-unapproved');
  return need({ kind: 'unit', label: 'no check runs its tests', finding });
}

function machineNeeds(input: ReadinessInput, unit: RepoUnit, byId: Map<string, ReadinessFinding>): Need[] {
  const probes = input.probes;
  if (!probes) return [];
  const out: Need[] = [];
  if (unit.toolchain) {
    const label = `${toolchainProgram(unit.toolchain.name)?.label ?? unit.toolchain.name} ${unit.toolchain.version}`;
    out.push(need({ kind: 'version', label, finding: byId.get(`version:${unit.dir}`) }));
  }
  if (unit.dir in probes.installed)
    out.push(need({ kind: 'install', label: 'dependencies installed', finding: byId.get(`install:${unit.dir}`) }));
  for (const n of unit.needs) {
    if (n.kind === 'browser') out.push(need({ kind: 'browser', label: 'a browser', finding: byId.get('browser') }));
    if (n.kind === 'service' && n.name in probes.services)
      out.push(need({ kind: 'service', label: n.name, finding: byId.get(`service:${n.name}`) }));
    if (n.kind === 'variable')
      out.push(need({ kind: 'variable', label: n.name, finding: byId.get(`variable:${n.name}`) }));
  }
  return out;
}

/** Every unit with what it needs here, each met (✓) or not (✗, with the finding that says what to do). */
export function unitRows(input: ReadinessInput, findings: ReadinessFinding[]): UnitReadiness[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  return input.profile.units.map((unit) => {
    const check = checkNeed(input, unit, byId);
    return {
      dir: unit.dir,
      ecosystem: unit.ecosystem,
      manifest: unit.manifest,
      ...(unit.manager ? { manager: unit.manager } : {}),
      ...(unit.lockfile ? { lockfile: unit.lockfile } : {}),
      ...(unit.memberOf !== undefined ? { memberOf: unit.memberOf } : {}),
      ...(unit.toolchain ? { toolchain: unit.toolchain } : {}),
      needs: [...(check ? [check] : []), ...machineNeeds(input, unit, byId)],
    };
  });
}
