import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Dependency folders. Earlier versions linked the repo's own into the worktree for checks on main; they are
 * looked for only to remove such links from a worktree one of them left behind (mainWorktree.ts).
 */
const DEPENDENCIES = new Set(['node_modules', '.venv']);
const SKIP = new Set(['.git', '.teamtrail', 'node_modules', '.venv', 'dist', 'build']);
/** How deep a package folder may be (`apps/web` is 2, `packages/a/b/c` is 4). */
const DEPTH = 4;
/** At most this many dependency folders, the shallowest first. */
const MAX_FOLDERS = 20;
/** At most this many folders are read looking for them, so a huge tree costs little. */
const MAX_VISITS = 2000;

function entries(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/** Whether `rel` under `top` resolves inside `top`: a dependency folder that is a link out of the repo is never used. */
function insideRepo(top: string, realTop: string, rel: string): boolean {
  try {
    const real = realpathSync(path.join(top, rel));
    return real.startsWith(realTop + path.sep);
  } catch {
    return false;
  }
}

function isFolder(p: string): boolean {
  return lstatSync(p, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/**
 * The repo's dependency folders (`node_modules`, `.venv`) at its root and in package folders up to four levels deep
 * (`apps/web/node_modules`), as paths relative to `top`, shallowest first and at most twenty. Symlinked folders are
 * never followed, and a dependency folder that resolves outside the repo is left out.
 */
export function dependencyFolders(top: string): string[] {
  let realTop: string;
  try {
    realTop = realpathSync(top);
  } catch {
    return [];
  }
  const found: string[] = [];
  const queue: { rel: string; depth: number }[] = [{ rel: '', depth: 0 }];
  for (let visits = 0; queue.length && visits < MAX_VISITS && found.length < MAX_FOLDERS; visits++) {
    const { rel, depth } = queue.shift()!;
    const names = entries(path.join(top, rel));
    const deps = names.filter((n) => DEPENDENCIES.has(n)).map((n) => path.join(rel, n));
    found.push(...deps.filter((d) => insideRepo(top, realTop, d)));
    if (depth >= DEPTH) continue;
    const folders = names.filter((n) => !SKIP.has(n) && !n.startsWith('.') && isFolder(path.join(top, rel, n)));
    queue.push(...folders.map((n) => ({ rel: path.join(rel, n), depth: depth + 1 })));
  }
  return found.slice(0, MAX_FOLDERS);
}
