import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { BRAND } from '../model/brand';
import type { ProjectEntry } from '../model/project';
import { projectId, realRoot } from './projectId';
import { projectName, repoOfRoot } from './projectName';
import { readProjects, updateProjects } from './projectsFile';

export class ProjectPathError extends Error {}

/**
 * The tracker folder for a path someone gave: the path itself when it is a tracker folder (or holds
 * `trackers.json`), else `<path>/.teamtrail`, created when missing. The repo folder must exist.
 */
export function trackerRootFor(input: string, opts: { create?: boolean } = {}): string {
  const abs = path.resolve(input);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new ProjectPathError(`no folder at ${abs}`);
  if (path.basename(abs) === BRAND.dataDir || existsSync(path.join(abs, 'trackers.json'))) return realRoot(abs);
  const root = path.join(abs, BRAND.dataDir);
  if (!existsSync(root) && opts.create) mkdirSync(root, { recursive: true });
  return realRoot(root);
}

/** Adds a tracker folder to the registry; registering it again changes nothing. */
export function registerProject(input: { configDir: string; root: string; now?: number }): {
  entry: ProjectEntry;
  added: boolean;
} {
  const id = projectId(input.root);
  const known = readProjects(input.configDir).projects.find((p) => p.id === id);
  if (known) return { entry: known, added: false };
  const root = realRoot(input.root);
  const entry: ProjectEntry = {
    id,
    name: projectName(root),
    path: repoOfRoot(root),
    root,
    addedAt: input.now ?? Date.now(),
  };
  updateProjects(input.configDir, (f) => ({ ...f, projects: [...f.projects.filter((p) => p.id !== id), entry] }));
  return { entry, added: true };
}

/** Removes a project by id (or by a path that resolves to it). Its repo and files are left alone. */
export function unregisterProject(input: { configDir: string; idOrPath: string }): ProjectEntry | undefined {
  const { projects } = readProjects(input.configDir);
  const byId = projects.find((p) => p.id === input.idOrPath);
  const real = realRoot(input.idOrPath);
  const byPath = projects.find((p) => p.path === real || p.root === real);
  const gone = byId ?? byPath;
  if (!gone) return undefined;
  updateProjects(input.configDir, (f) => ({ ...f, projects: f.projects.filter((p) => p.id !== gone.id) }));
  return gone;
}
