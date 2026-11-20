import type { RepoFiles } from '../model/checkScreening';
import type { RepoProfile, RepoUnit, WorkspaceTool } from '../model/repoProfile';
import { agentDocs } from './agentDocs';
import { ciHints } from './ciHints';
import { composeNeeds } from './composeNeeds';
import { dotnetUnit } from './dotnetUnit';
import { envExampleNeeds } from './envExampleNeeds';
import { goUnit } from './goUnit';
import { gradleUnit } from './gradleUnit';
import { layoutOf } from './layoutOf';
import { PROFILE_LIMITS } from './limits';
import { makeCommands } from './makeCommands';
import { makeTasks } from './makeTasks';
import { mavenUnit } from './mavenUnit';
import { nodeUnit } from './nodeUnit';
import { otherUnits } from './otherUnits';
import { phpUnit } from './phpUnit';
import { profileReader } from './profileReader';
import { pythonUnit } from './pythonUnit';
import { rubyUnit } from './rubyUnit';
import { rustUnit } from './rustUnit';
import type { FolderView, ProfileReader, UnitDetector } from './types';
import { uniqueNeeds } from './uniqueNeeds';
import { unitContext } from './unitContext';
import { walkRepo } from './walkRepo';
import { workspaceTools } from './workspaceTools';

/** Every stack's detector, in the order a folder's units are listed. */
const DETECTORS: UnitDetector[] = [
  nodeUnit,
  pythonUnit,
  goUnit,
  rustUnit,
  gradleUnit,
  mavenUnit,
  rubyUnit,
  phpUnit,
  dotnetUnit,
  otherUnits,
];

const EMPTY: FolderView = { dir: '', depth: 0, files: new Set(), dirs: new Set() };

/** A folder's Makefile targets (checks and tasks) go to its first unit; its example env names to every unit in it below the top. */
async function extras(folder: FolderView, units: RepoUnit[], reader: ProfileReader) {
  if (!units.length) return;
  const make = ['Makefile', 'GNUmakefile'].find((f) => folder.files.has(f));
  if (make) {
    const file = folder.dir ? `${folder.dir}/${make}` : make;
    const text = (await reader.read(file)) ?? '';
    units[0].commands.push(...makeCommands({ text, dir: folder.dir, file }));
    units[0].tasks = [...(units[0].tasks ?? []), ...makeTasks({ text, dir: folder.dir, file })];
  }
  if (!folder.dir) return;
  const env = await envExampleNeeds(folder, reader);
  for (const u of units) u.needs = uniqueNeeds([...u.needs, ...env]);
}

async function unitsOf(folders: FolderView[], tools: WorkspaceTool[], reader: ProfileReader): Promise<RepoUnit[]> {
  const top = folders[0] ?? EMPTY;
  const units: RepoUnit[] = [];
  for (const folder of folders) {
    const ctx = unitContext({ folder, top, reader, tools });
    const here: RepoUnit[] = [];
    for (const detect of DETECTORS) here.push(...(await detect(ctx)));
    await extras(folder, here, reader);
    units.push(...here);
    if (units.length >= PROFILE_LIMITS.units) {
      reader.cut();
      break;
    }
  }
  const depth = (dir: string) => (dir ? dir.split('/').length : 0);
  const sorted = units.map((u, i) => ({ u, i }));
  sorted.sort(
    (a, b) => depth(a.u.dir) - depth(b.u.dir) || (a.u.dir < b.u.dir ? -1 : Number(a.u.dir > b.u.dir)) || a.i - b.i,
  );
  return sorted.map((s) => s.u).slice(0, PROFILE_LIMITS.units);
}

/**
 * What the repo is, from its files alone (model/repoProfile.ts): its units (folder, stack, package manager,
 * lockfile, pinned toolchain, frozen install, commands with their folder), the workspaces tying them together, the
 * agent docs it has, what CI runs, and what its tests need (a browser, services, variable names). Pure over
 * `files` (the same locally and for a server reading GitHub), deterministic, bounded by PROFILE_LIMITS, and it never
 * runs anything.
 */
export async function detectRepoProfile(files: RepoFiles): Promise<RepoProfile> {
  const reader = profileReader(files);
  const folders = await walkRepo(files, reader);
  const top = folders[0] ?? EMPTY;
  const tools: WorkspaceTool[] = [];
  for (const folder of folders) tools.push(...(await workspaceTools(folder, reader)));
  const units = await unitsOf(folders, tools, reader);
  const ci = await ciHints({ files, top, reader });
  const needs = uniqueNeeds([
    ...(await composeNeeds(top, reader)),
    ...ci.needs,
    ...(await envExampleNeeds(top, reader)),
  ]);
  return {
    v: 1,
    basis: await reader.basis(),
    layout: layoutOf(units),
    units,
    workspaceTools: tools,
    agentDocs: await agentDocs(files, top),
    ci: ci.hints,
    needs,
    truncated: reader.truncated,
    listed: !!files.list,
  };
}
