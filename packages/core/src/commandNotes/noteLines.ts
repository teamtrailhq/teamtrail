import type { Need, RepoProfile, RepoUnit } from '../model/repoProfile';
import type { VerificationConfig } from '../model/verification';
import { CHECK_ENV } from '../verification/checkEnv';
import { inUnit } from './inUnit';

const ROLE_LABEL: Record<string, string> = {
  test: 'Test',
  lint: 'Lint',
  typecheck: 'Typecheck',
  format: 'Format check',
  check: 'Check',
  build: 'Build',
  run: 'Run',
};
const ORDER = ['test', 'lint', 'typecheck', 'format', 'check', 'build', 'run'];

const code = (argv: string[]) => `\`${argv.join(' ')}\``;
const where = (dir: string | undefined) => (dir ? `in ${dir}` : 'in the top folder');

/** How the unit installs: its own frozen install, else its workspace root's. */
function installLine(unit: RepoUnit, profile: RepoProfile): string[] {
  if (unit.install) return [`- Install: ${code(unit.install)} ${where(unit.dir)}`];
  if (unit.memberOf === undefined) return [];
  const root = profile.units.find((u) => u.dir === unit.memberOf && u.install && u.ecosystem === unit.ecosystem);
  if (!root?.install) return [`- Install: from the workspace ${where(unit.memberOf)}`];
  return [`- Install: ${code(root.install)} ${where(root.dir)} (the workspace installs it)`];
}

/** Test, lint, … build and run, one line per role, the first command of each. */
function roleLines(unit: RepoUnit): string[] {
  const all = [...unit.commands, ...(unit.tasks ?? [])];
  return ORDER.flatMap((role) => {
    const c = all.find((x) => x.role === role);
    return c ? [`- ${ROLE_LABEL[role]}: ${code(c.run)} ${where(c.cwd)}`] : [];
  });
}

/** The approved setup steps and checks that run for this unit. */
function approvedLines(unit: RepoUnit, config: VerificationConfig | undefined): string[] {
  if (!config) return [];
  const setup = Object.entries(config.setup ?? {}).filter(([, s]) => inUnit({ unit, cwd: s.cwd, member: true }));
  const checks = Object.entries(config.checks).filter(([, s]) => inUnit({ unit, cwd: s.cwd }));
  return [
    ...(setup.length
      ? [`- Setup Teamtrail runs in its worktrees: ${setup.map(([n, s]) => `${n} (${code(s.run)})`).join(', ')}`]
      : []),
    ...(checks.length
      ? [`- Checks on completion: ${checks.map(([n, s]) => `${n} (${code(s.run)} ${where(s.cwd)})`).join(', ')}`]
      : []),
  ];
}

const needText = (n: Need) => {
  if (n.kind === 'variable') return `${n.name}${n.secretShaped ? ' (secret-shaped: use a test value)' : ''}`;
  return n.kind === 'browser' ? `a browser (${n.name})` : `${n.name} running`;
};

/** What its tests need, by name only. */
function needLines(needs: Need[]): string[] {
  if (!needs.length) return [];
  const variables = needs.some((n) => n.kind === 'variable')
    ? `; checks get a variable only when the person names it in ${CHECK_ENV}`
    : '';
  return [`- Tests need: ${needs.map(needText).join(', ')}${variables}`];
}

/** The lines of one unit's note, in a fixed order. */
export function noteLines(o: {
  unit: RepoUnit;
  profile: RepoProfile;
  config: VerificationConfig | undefined;
  needs: Need[];
}): string[] {
  const { unit } = o;
  const pin = unit.toolchain
    ? [`- Toolchain: ${unit.toolchain.name} ${unit.toolchain.version} (${unit.toolchain.from})`]
    : [];
  const manager = unit.manager ? `, ${unit.manager}` : '';
  const docs = !unit.dir && o.profile.agentDocs.length ? [`- Read first: ${o.profile.agentDocs.join(', ')}`] : [];
  return [
    `${unit.ecosystem}${manager} · ${unit.manifest} ${where(unit.dir)}`,
    '',
    ...docs,
    ...pin,
    ...installLine(unit, o.profile),
    ...roleLines(unit),
    ...approvedLines(unit, o.config),
    ...needLines(o.needs),
  ];
}
