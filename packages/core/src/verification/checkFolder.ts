import type { RepoFiles } from '../model/checkScreening';
import { repoPath } from './repoPath';

const MAX_FOLDER = 200;

/**
 * A check's folder as it's stored: repo-relative with `/`, `.` and empty parts dropped, '' for the top. Undefined
 * when it's absolute, leaves the repo, is too long or holds a control character.
 */
export function checkFolder(cwd: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what's refused
  if (cwd.length > MAX_FOLDER || /[\0-\x1f]/.test(cwd)) return undefined;
  return repoPath(cwd);
}

/**
 * Why a check can't be set to run in `cwd`, or undefined: it must be a folder inside the repo, reached through
 * real folders only. Each part is looked up in its parent's listing, which leaves symbolic links out, so a link
 * (even one that stays inside) never becomes a check's folder. Without the repo's files to read, only the top.
 */
export async function checkFolderProblem(o: { cwd: string; files?: RepoFiles }): Promise<string | undefined> {
  const clean = checkFolder(o.cwd);
  if (clean === undefined) return `"${o.cwd}" isn't a folder inside the repository`;
  if (!clean) return undefined;
  if (!o.files) return "the repository's folders can't be read here; leave the folder empty to run from the top";
  const parts = clean.split('/');
  for (let i = 0; i < parts.length; i++) {
    const parent = parts.slice(0, i).join('/');
    const real = o.files.list
      ? (await o.files.list(parent).catch(() => undefined))?.some((e) => e.name === parts[i] && e.kind === 'dir')
      : (await o.files.kind(parts.slice(0, i + 1).join('/')).catch(() => undefined)) === 'dir';
    if (!real) return `no folder ${clean} in the repository`;
  }
  return undefined;
}
