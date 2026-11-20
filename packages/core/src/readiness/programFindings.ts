import { BRAND } from '../model/brand';
import type { LocalProbes, ReadinessFinding } from '../model/readiness';
import { approvedChecks } from './approvedChecks';
import { folderLabel } from './folderLabel';
import { toolchainProgram } from './toolchainProgram';
import type { ReadinessInput } from './types';
import { versionMatches } from './versionMatches';

const ON_PATH = `install it, or put it on the PATH of the shell you start ${BRAND.slug} from`;

/** A program the approved checks (or setup steps) start that isn't on the checks' PATH: those checks can't run. */
function missingPrograms(input: ReadinessInput, probes: LocalProbes): ReadinessFinding[] {
  const checks = approvedChecks(input.config);
  const setup = Object.entries(input.config?.setup ?? {});
  const out: ReadinessFinding[] = [];
  for (const [program, found] of Object.entries(probes.programs)) {
    if (found.path) continue;
    const stopped = checks.filter((c) => c.run[0] === program).map((c) => c.name);
    const steps = setup.filter(([, s]) => s.run[0] === program).map(([name]) => name);
    if (!stopped.length && !steps.length) continue;
    const who = stopped.length ? stopped.join(', ') : `the setup step ${steps.join(', ')}`;
    out.push({
      id: `program:${program}`,
      kind: 'program',
      level: stopped.length ? 'blocks' : 'warns',
      text: `${program} isn't installed on this machine, so ${who} can't run`,
      why: `no ${program} on the PATH checks run with`,
      ...(stopped.length ? { checks: stopped } : {}),
      howTo: [`${program}: ${ON_PATH}`],
    });
  }
  return out;
}

/** The version a pin asks for as a range: a go.mod `go` line is a minimum, not an exact version. */
const rangeOf = (name: string, version: string, from: string) =>
  name === 'go' && / go$/.test(from) && !/[<>=^~]/.test(version) ? `>=${version}` : version;

/** One unit's pinned toolchain against what's here: missing, or a version outside the pin. */
function toolchainFinding(
  input: ReadinessInput,
  o: { probes: LocalProbes; dir: string; said: Set<string> },
): ReadinessFinding | undefined {
  const { probes, dir } = o;
  const pin = input.profile.units.find((u) => u.dir === dir)?.toolchain;
  const tool = pin && toolchainProgram(pin.name);
  const here = pin && probes.toolchains[pin.name];
  if (!pin || !tool || !here) return undefined;
  const base = { kind: 'version' as const, level: 'warns' as const, unit: dir };
  const asked = `${tool.label} ${pin.version} (${pin.from})`;
  // a missing program already said once: no second line about its toolchain
  if (!here.path && o.said.has(tool.programs[0])) return undefined;
  if (!here.path)
    return {
      ...base,
      id: `version:${dir}`,
      text: `${tool.label} isn't installed on this machine; ${folderLabel(dir)} asks for ${pin.version}`,
      why: `${asked}; no ${tool.programs[0]} on the PATH checks run with`,
      howTo: [`${tool.programs[0]}: ${ON_PATH}`],
    };
  const fits = here.version ? versionMatches(rangeOf(pin.name, pin.version, pin.from), here.version) : undefined;
  if (fits !== false) return undefined;
  return {
    ...base,
    id: `version:${dir}`,
    text: `${tool.label} ${here.version} here; ${folderLabel(dir)} asks for ${pin.version}`,
    why: `${asked}; ${tool.programs[0]} --version printed ${here.version} here`,
    howTo: [`Install ${tool.label} ${pin.version} (with nvm, mise, asdf or your package manager), then check again`],
  };
}

/** Programs the checks start that aren't here (blocking), and toolchains the repo pins that are missing or off. */
export function programFindings(input: ReadinessInput): ReadinessFinding[] {
  const probes = input.probes;
  if (!probes) return [];
  const missing = missingPrograms(input, probes);
  const said = new Set(missing.map((f) => f.id.slice('program:'.length)));
  const pins = input.profile.units.filter((u) => u.toolchain).map((u) => u.dir);
  const versions = pins
    .map((dir) => toolchainFinding(input, { probes, dir, said }))
    .filter((f): f is ReadinessFinding => !!f);
  return [...missing, ...versions];
}
