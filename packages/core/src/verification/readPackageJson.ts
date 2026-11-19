import type { RepoFiles } from '../model/checkScreening';
import { repoPath } from './repoPath';

/** The parts of a package.json screening reads. */
export interface PackageFacts {
  scripts: Set<string>;
  /** Each script's command line, by name. */
  scriptLines: Map<string, string>;
  deps: Set<string>;
}

const keysOf = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : []);
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/** The package.json in `dir`: missing (undefined), not readable as JSON (`invalid`), or its scripts and dependencies. */
export async function readPackageJson(files: RepoFiles, dir: string): Promise<PackageFacts | 'invalid' | undefined> {
  const text = await files.read(repoPath(dir, 'package.json') ?? 'package.json');
  if (text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'invalid';
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'invalid';
  const pkg = raw as Record<string, unknown>;
  const scripts = keysOf(pkg.scripts).length ? (pkg.scripts as Record<string, unknown>) : {};
  const lines = Object.entries(scripts).filter((e): e is [string, string] => typeof e[1] === 'string');
  return {
    scripts: new Set(keysOf(pkg.scripts)),
    scriptLines: new Map(lines),
    deps: new Set(DEP_FIELDS.flatMap((f) => keysOf(pkg[f]))),
  };
}
