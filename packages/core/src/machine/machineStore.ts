import { rmSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile } from '../lib/jsonFile';
import { configDir } from '../server/trackerConfig';
import { machineId } from './machineId';
import { writePrivateFile } from './writePrivateFile';

/*
 * What this machine trusts about one project, kept where nothing in the repo can write it:
 *   <config dir>/projects/<project id>/<name>.json     0600, in a 0700 folder, written atomically
 * <config dir> is the one credentials.json and projects.json use; <project id> is the full sha256 of the tracker
 * folder's real path as the file system spells it (machineId.ts). An agent that can edit files in the repo, or a teammate's push,
 * can change what a project asks for, never what the human approved here. A repo that moves gets a new id, so its
 * approvals are asked again: the safe direction.
 */
export const MACHINE_PROJECTS_DIR = 'projects';

export function machineStore(root: string, dir: string = configDir()) {
  const id = machineId(root);
  const base = path.join(dir, MACHINE_PROJECTS_DIR, id);
  const file = (name: string) => path.join(base, name);
  return {
    id,
    dir: base,
    file,
    read: <T>(name: string): T | undefined => readJsonFile<T>(file(name)),
    write: (name: string, value: unknown) => writePrivateFile(file(name), `${JSON.stringify(value, null, 2)}\n`),
    remove: (name: string) => rmSync(file(name), { force: true }),
  };
}

export type MachineStore = ReturnType<typeof machineStore>;
