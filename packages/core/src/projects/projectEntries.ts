import type { ProjectEntry } from '../model/project';
import { projectId, realRoot } from './projectId';
import { projectName, repoOfRoot } from './projectName';
import { readProjects } from './projectsFile';

/** The home project (the folder this process serves) as an entry, registered or not. */
export function homeEntry(root: string): ProjectEntry {
  const real = realRoot(root);
  return { id: projectId(root), name: projectName(real), path: repoOfRoot(real), root: real, addedAt: 0 };
}

/** Every project this Lookout shows: home first, then the registry in the order repos were added. */
export function projectEntries(
  configDir: string,
  homeRoot: string,
): { entries: ProjectEntry[]; autoRegister: boolean } {
  const file = readProjects(configDir);
  const home = homeEntry(homeRoot);
  const registeredHome = file.projects.find((p) => p.id === home.id);
  const others = file.projects.filter((p) => p.id !== home.id);
  return { entries: [registeredHome ?? home, ...others], autoRegister: file.autoRegister };
}
