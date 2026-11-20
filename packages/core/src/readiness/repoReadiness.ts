import type { ReadinessFinding, ReadinessKind, ReadinessLevel, RepoReadiness } from '../model/readiness';
import { checkFindings } from './checkFindings';
import { coverageFindings } from './coverageFindings';
import { installFindings } from './installFindings';
import { needFindings } from './needFindings';
import { programFindings } from './programFindings';
import type { ReadinessInput } from './types';
import { unitRows } from './unitRows';
import { withFixHash } from './withFixHash';

const LEVELS: ReadinessLevel[] = ['blocks', 'warns', 'info'];
const KINDS: ReadinessKind[] = [
  'checks',
  'check',
  'program',
  'folder',
  'unit',
  'install',
  'version',
  'browser',
  'service',
  'variable',
];

const order = (a: ReadinessFinding, b: ReadinessFinding) =>
  LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) ||
  KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
  (a.id < b.id ? -1 : Number(a.id > b.id));

/**
 * Whether Teamtrail can check work in this repo here: the repo profile, the approved checks and setup steps, what
 * screening says of them and what this machine has (probeLocal.ts), as findings, blocking ones first, each with a
 * plain line, its evidence, and a fix (one click only where that's the trail lead's approval of what's shown) or the
 * commands to run themselves. Pure and deterministic: the same input gives the same result.
 */
export function repoReadiness(input: ReadinessInput): RepoReadiness {
  const findings = [
    ...checkFindings(input),
    ...programFindings(input),
    ...coverageFindings(input),
    ...installFindings(input),
    ...needFindings(input),
  ]
    .map(withFixHash)
    .sort(order);
  const { profile } = input;
  return {
    v: 1,
    basis: profile.basis,
    base: input.approval.hash,
    probed: input.probes ? 'here' : 'skipped',
    checkedAt: input.now,
    layout: profile.layout,
    tools: [...new Set(profile.workspaceTools.map((t) => t.tool))],
    ci: [...new Set(profile.ci.map((c) => c.file))],
    units: unitRows(input, findings),
    findings,
    blocking: findings.filter((f) => f.level === 'blocks').length,
    read: true,
  };
}
