import { isLive, type KnowledgeEntry } from '../knowledge/knowledge';
import type { RepoProfile, RepoUnit } from '../model/repoProfile';
import type { VerificationConfig } from '../model/verification';
import { uniqueNeeds } from '../repoProfile/uniqueNeeds';
import { inUnit } from './inUnit';
import { packagesFor } from './packagesFor';
import { PROFILE_SOURCE, type PackageCommands } from './types';
import { unitKey } from './unitKey';

const argvText = (argv: string[]) => argv.join(' ');
const folder = (cwd?: string) => (cwd ?? '').replace(/^\.\/?/, '').replace(/\/+$/, '') || '.';

/** The trail lead's note for the unit: live only. A suggestion is never handed out, only said to wait. */
function notesOf(unit: RepoUnit, notes: KnowledgeEntry[], staleOf: (e: KnowledgeEntry) => string[]) {
  const note = notes.find((e) => e.sources.includes(PROFILE_SOURCE) && e.sources.includes(unitKey(unit)));
  const name = unit.dir || 'this repo';
  if (!note || note.status === 'outdated')
    return { waiting: `No confirmed notes on how to build and test ${name} yet: read its ${unit.manifest} yourself.` };
  if (!isLive(note))
    return {
      waiting: `${note.id}, how to build and test ${name}, waits for the trail lead to confirm it: until then read its ${unit.manifest} yourself.`,
    };
  const stale = staleOf(note);
  const status = note.status as 'confirmed' | 'assumption';
  return { notes: { id: note.id, status, body: note.body, ...(stale.length ? { mayBeOutdated: stale } : {}) } };
}

/** What the approved verification.json runs for the unit: its setup steps and checks. */
function approvedFor(unit: RepoUnit, config: VerificationConfig | undefined) {
  if (!config) return {};
  const setup = Object.entries(config.setup ?? {})
    .filter(([, s]) => inUnit({ unit, cwd: s.cwd, member: true }))
    .map(([step, s]) => ({ step, run: argvText(s.run), cwd: folder(s.cwd) }));
  const checks = Object.entries(config.checks)
    .filter(([, s]) => inUnit({ unit, cwd: s.cwd }))
    .map(([name, s]) => ({ name, run: argvText(s.run), cwd: folder(s.cwd) }));
  return { ...(setup.length ? { setup } : {}), ...(checks.length ? { checks } : {}) };
}

/**
 * What a claim tells the agent about the packages its work touches (packagesFor.ts): per package, the commands from
 * the note the trail lead confirmed (never a suggestion: an unreviewed note is only said to wait), the setup steps
 * and checks the approved verification.json runs for it, and what its tests need, read from the repo's files (names
 * only), each variable with whether checks here get it (`passed`). Pure.
 */
export function claimCommands(o: {
  profile: RepoProfile;
  notes: KnowledgeEntry[];
  config: VerificationConfig | undefined;
  paths: string[];
  passed: (name: string) => boolean;
  staleOf?: (e: KnowledgeEntry) => string[];
}): PackageCommands[] {
  const hasTop = o.profile.units.some((u) => !u.dir);
  return packagesFor(o.profile, o.paths).map((unit) => {
    const needs = uniqueNeeds([...unit.needs, ...(!unit.dir || !hasTop ? o.profile.needs : [])]).map((n) =>
      n.kind === 'variable' ? { ...n, passedToChecks: o.passed(n.name) } : n,
    );
    return {
      package: unit.dir || '.',
      ecosystem: unit.ecosystem,
      ...notesOf(unit, o.notes, o.staleOf ?? (() => [])),
      ...approvedFor(unit, o.config),
      ...(needs.length ? { needs } : {}),
    };
  });
}
