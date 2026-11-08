import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { PROJECTS_FILE, type ProjectEntry, type ProjectsFile } from '../model/project';

export const projectsPath = (configDir: string) => path.join(configDir, PROJECTS_FILE);

const EMPTY: ProjectsFile = { v: 1, projects: [], autoRegister: true };

function validEntry(e: unknown): e is ProjectEntry {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  const strings = ['id', 'name', 'path', 'root'].every((k) => typeof o[k] === 'string' && o[k]);
  return strings && typeof o.addedAt === 'number' && /^[0-9a-f]{6,64}$/.test(o.id as string);
}

/** The registry, checked by hand: unknown or broken entries are dropped, a missing file is an empty registry. */
export function readProjects(configDir: string): ProjectsFile {
  const raw = readJsonFile<Partial<ProjectsFile>>(projectsPath(configDir));
  if (!raw || typeof raw !== 'object') return { ...EMPTY, projects: [] };
  const list = Array.isArray(raw.projects) ? raw.projects.filter(validEntry) : [];
  const seen = new Set<string>();
  const projects = list.filter((p) => !seen.has(p.id) && seen.add(p.id));
  return { v: 1, projects, autoRegister: raw.autoRegister !== false };
}

/** Writes the registry atomically, so a reader never sees half of it. */
export function writeProjects(configDir: string, file: ProjectsFile) {
  writeJsonAtomic(projectsPath(configDir), file);
}

/** Read, change, write. */
export function updateProjects(configDir: string, change: (f: ProjectsFile) => ProjectsFile): ProjectsFile {
  const next = change(readProjects(configDir));
  writeProjects(configDir, next);
  return next;
}
