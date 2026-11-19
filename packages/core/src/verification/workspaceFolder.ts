import type { RepoFiles } from '../model/checkScreening';
import { folderChain } from './folderChain';
import { repoPath } from './repoPath';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function parse(text: string | undefined): Record<string, unknown> | undefined {
  if (text === undefined) return undefined;
  try {
    const raw: unknown = JSON.parse(text);
    return isObj(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** A package.json's `workspaces` globs (an array, or Yarn's `{ packages }`). */
function npmGlobs(pkg: Record<string, unknown> | undefined): string[] | undefined {
  const ws = pkg?.workspaces;
  const list = isObj(ws) ? ws.packages : ws;
  return Array.isArray(list) ? list.filter((g): g is string => typeof g === 'string') : undefined;
}

/** The `packages:` list of a pnpm-workspace.yaml, read line by line (`- 'apps/*'`). */
function pnpmGlobs(text: string | undefined): string[] | undefined {
  if (text === undefined) return undefined;
  const out: string[] = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) inside = /^packages\s*:/.test(line);
    const item = inside ? /^\s+-\s*['"]?([^'"#\s]+)['"]?/.exec(line) : null;
    if (item) out.push(item[1]);
  }
  return out;
}

/** The workspace root at or above `cwd`: the nearest folder whose package.json or pnpm-workspace.yaml lists packages. */
async function workspaceRoot(files: RepoFiles, cwd: string) {
  for (const dir of folderChain(cwd)) {
    const pnpm = pnpmGlobs(await files.read(repoPath(dir, 'pnpm-workspace.yaml') ?? ''));
    if (pnpm) return { dir, globs: pnpm };
    const npm = npmGlobs(parse(await files.read(repoPath(dir, 'package.json') ?? 'package.json')));
    if (npm) return { dir, globs: npm };
  }
  return undefined;
}

/** pnpm's selector without its graph markers (`web...`, `...web`, `{apps/web}`, `./apps/web`). */
const selector = (s: string) => s.replace(/^\.\.\.\^?|\^?\.\.\.$/g, '').replace(/^\{(.*)\}$/, '$1');

/** The folder a workspace glob would put a package of this name in: `packages/*` and `@acme/ui` → `packages/ui`. */
function candidates(globs: string[], name: string): string[] {
  const last = name.split('/').pop() ?? name;
  return globs
    .filter((g) => !g.startsWith('!'))
    .map((g) => g.replace(/\/\*\*?$/, `/${last}`))
    .filter((g) => !/[*?[{]/.test(g));
}

/**
 * The folder a workspace flag names (`npm -w <name or path>`, `pnpm --filter <selector>`), relative to the repo, when
 * reading the repo can tell: a folder with a package.json, or a package of that name where the workspace's globs would
 * put it. Undefined when it can't (a glob, an exclusion, a package whose folder is named otherwise): screening then
 * says nothing about it rather than guess.
 */
export async function workspaceFolder(o: { files: RepoFiles; cwd: string; name: string }): Promise<string | undefined> {
  const name = selector(o.name);
  if (!name || /[*?!]/.test(name)) return undefined;
  const asPath = repoPath(o.cwd, name);
  if (asPath !== undefined && (await o.files.kind(repoPath(asPath, 'package.json') ?? '')) === 'file') return asPath;
  const root = await workspaceRoot(o.files, o.cwd);
  if (!root) return undefined;
  for (const glob of candidates(root.globs, name)) {
    const dir = repoPath(root.dir, glob);
    if (dir === undefined) continue;
    const pkg = parse(await o.files.read(repoPath(dir, 'package.json') ?? ''));
    if (pkg?.name === name || dir.split('/').pop() === name) return dir;
  }
  return undefined;
}
