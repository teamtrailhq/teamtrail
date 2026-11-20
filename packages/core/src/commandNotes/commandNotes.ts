import type { RepoProfile, RepoUnit } from '../model/repoProfile';
import type { VerificationConfig } from '../model/verification';
import { uniqueNeeds } from '../repoProfile/uniqueNeeds';
import { noteLines } from './noteLines';
import { COMMANDS_TAG, type CommandNote } from './types';
import { unitKey } from './unitKey';

const MAX_NOTES = 20;

/** A unit worth a note: it has commands, tasks or an install of its own, or installs from a workspace. */
const worthANote = (u: RepoUnit) =>
  u.commands.length > 0 || !!u.tasks?.length || !!u.install || u.memberOf !== undefined;

/** The manifests a unit's note is read from: its own and its lockfile, and its workspace root's. */
function anchorsOf(unit: RepoUnit, profile: RepoProfile): string[] {
  const at = (dir: string, file: string) => (dir ? `${dir}/${file}` : file);
  const own = [unit.manifest, unit.lockfile].filter((f): f is string => !!f).map((f) => at(unit.dir, f));
  const root = profile.units.find((u) => u.dir === unit.memberOf && u.ecosystem === unit.ecosystem);
  const shared = root ? [root.manifest, root.lockfile].filter((f): f is string => !!f).map((f) => at(root.dir, f)) : [];
  return [...new Set([...own, ...shared])];
}

/**
 * Notes of the project's commands, one per unit of the repo profile (repoProfile/): how to install, build, test, lint
 * and run it, its toolchain pin, the setup steps and checks the approved `config` runs for it, and what its tests
 * need, by name. Pure and deterministic. They are suggestions: only the trail lead's confirmation makes one reach
 * agents (proposeCommandNotes.ts). Project-wide needs go to the top unit's note, or to every note without one.
 */
export function commandNotes(o: { profile: RepoProfile; config?: VerificationConfig }): CommandNote[] {
  const { profile } = o;
  const hasTop = profile.units.some((u) => !u.dir);
  return profile.units
    .filter(worthANote)
    .slice(0, MAX_NOTES)
    .map((unit) => {
      const needs = uniqueNeeds([...unit.needs, ...(!unit.dir || !hasTop ? profile.needs : [])]);
      const lines = noteLines({ unit, profile, config: o.config, needs });
      const name = unit.dir || 'this repo';
      return {
        unit: unitKey(unit),
        dir: unit.dir,
        ecosystem: unit.ecosystem,
        title: `How to build and test ${name} (${unit.ecosystem})`,
        body: lines.join('\n'),
        scope: [unit.dir ? `${unit.dir}/**` : '**'],
        tags: [COMMANDS_TAG, unit.ecosystem],
        anchors: anchorsOf(unit, profile),
      };
    });
}
