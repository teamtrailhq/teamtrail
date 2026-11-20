import type {
  ReadinessFinding,
  ReadinessFix,
  ReadinessLevel,
  ReadinessTrail,
  RepoReadiness,
  UnitReadiness,
} from '@teamtrail/core';
import type { EdgeTone, MetaPart } from '../../components/ui';
import { sinceLabel } from '../../lib/sinceLabel';

/** A folder as people read it: the top of the repo, or its path. */
export const folderName = (dir: string) => dir || 'the top';

const EDGE: Record<ReadinessLevel, EdgeTone> = { blocks: 'urgent', warns: 'attention', info: 'neutral' };
const LEVEL: Record<ReadinessLevel, string> = {
  blocks: 'Holds new work',
  warns: 'A check may fail',
  info: 'Worth knowing',
};

/** A finding's status edge: red only when it holds work now. */
export const findingEdge = (f: ReadinessFinding) => EDGE[f.level];

/** A finding's context line: what it does to work, where, and which checks. */
export function findingContext(f: ReadinessFinding): MetaPart[] {
  const parts: MetaPart[] = [LEVEL[f.level]];
  if (f.unit !== undefined) parts.push({ text: folderName(f.unit), code: f.unit !== '' });
  if (f.checks?.length) parts.push(`${f.checks.length === 1 ? 'check' : 'checks'} ${f.checks.join(', ')}`);
  return parts;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The button that applies a fix: what it does, in a few words. */
export function fixLabel(fix: ReadinessFix): string {
  switch (fix.kind) {
    case 'add-checks':
      return fix.checks.length === 1
        ? `Add the check ${fix.checks[0].name}`
        : `Use ${plural(fix.checks.length, 'suggested check')}`;
    case 'set-folder':
      return `Run ${fix.check} in ${folderName(fix.cwd)}`;
    case 'add-setup':
      return `Add the setup step ${fix.name}`;
    default: {
      const never: never = fix;
      return never;
    }
  }
}

/** What a fix writes, exactly: each command and the folder it runs in, as approving it will save it. */
export function fixLines(fix: ReadinessFix): { name: string; run: string; cwd: string }[] {
  switch (fix.kind) {
    case 'add-checks':
      return fix.checks.map((c) => ({ name: c.name, run: c.run.join(' '), cwd: folderName(c.cwd) }));
    case 'set-folder':
      return [];
    case 'add-setup':
      return [{ name: fix.name, run: fix.run.join(' '), cwd: folderName(fix.cwd) }];
    default: {
      const never: never = fix;
      return never;
    }
  }
}

/** The programs a fix adds that Teamtrail doesn't know: adding them needs the person's word that they know them. */
export function unknownPrograms(fix: ReadinessFix): string[] {
  if (fix.kind !== 'add-checks') return [];
  return [...new Set(fix.checks.filter((c) => !c.known).map((c) => c.run[0]))];
}

const LAYOUT: Record<RepoReadiness['layout'], string | undefined> = {
  single: 'One project',
  workspace: 'Monorepo',
  multi: 'Several projects',
  none: undefined,
};

/** The summary under the heading: what the repo is, what ties it together, its CI, and where it was probed. */
export function summaryParts(r: RepoReadiness): MetaPart[] {
  const where = r.probed === 'here' ? 'probed on this machine' : 'this machine not probed: checks run elsewhere';
  return [
    LAYOUT[r.layout] ?? '',
    r.units.length > 1 ? plural(r.units.length, 'folder') : '',
    r.tools.join(', '),
    r.ci.length ? { text: r.ci.join(', '), code: true } : '',
    where,
  ];
}

/** A folder's context line: its stack, package manager, lockfile and the toolchain it pins. */
export function unitContext(u: UnitReadiness): MetaPart[] {
  const pin = u.toolchain ? `${u.toolchain.name} ${u.toolchain.version} (${u.toolchain.from})` : '';
  const member = u.memberOf !== undefined ? `installed from ${folderName(u.memberOf)}` : '';
  return [u.ecosystem, u.manager ?? '', u.lockfile ? { text: u.lockfile, code: true } : '', pin, member];
}

/** What a folder needs, met (✓) or not (✗), in one line. */
export const unitNeeds = (u: UnitReadiness) => u.needs.map((n) => `${n.ok ? '✓' : '✗'} ${n.label}`).join(' · ');

/** How readiness stands on one trail: what it holds there now, the trail lead's Start anyway, or why nothing waits. */
export function trailLine(t: ReadinessTrail, now: number): string {
  if (t.startedAnyway && !t.waits)
    return `You started it anyway ${sinceLabel(t.startedAnyway.at, now)}: new work goes on`;
  if (t.held) return `${plural(t.held, 'ready ticket')} held back`;
  if (t.waits) return 'New implementation work waits; research and reviews go on';
  return "Nothing waits: its work isn't verified with checks";
}
