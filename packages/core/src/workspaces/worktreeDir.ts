import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export type WorktreeDir = { dir: string } | { refused: string };

/** `p` with every symlink on the way resolved, for the part of it that exists. */
function realish(p: string): string {
  if (existsSync(p)) return realpathSync(p);
  const parent = path.dirname(p);
  return parent === p ? p : path.join(realish(parent), path.basename(p));
}

const inside = (parent: string, p: string) => p === parent || p.startsWith(parent + path.sep);

/** Why a `dir` from workspaces.json can't be used as written, before the disk is looked at. */
export function dirProblem(dir: string): string | undefined {
  if (path.posix.isAbsolute(dir) || path.win32.isAbsolute(dir) || dir.startsWith('~') || dir.includes('\\'))
    return 'must be a relative path with "/" (for example "../worktrees")';
  return undefined;
}

/**
 * Where worktrees go: `dir` from workspaces.json (committed, so a teammate's push can change it) resolved from
 * the repo, or the default `../<repo>.teamtrail`. It has to stay where the default is: inside the repo's parent
 * folder once symlinks are resolved, and not in a hidden folder outside the repo (`../.config`, `../.claude`,
 * where tools read their own files from). Anything else is refused, and the claim works in the repo.
 */
export function worktreeDir(top: string, dir?: string): WorktreeDir {
  if (dir === undefined) return { dir: path.resolve(top, `../${path.basename(top)}.teamtrail`) };
  const refused = (why: string): WorktreeDir => ({
    refused: `workspaces.json "dir" (${dir}) ${why}. Worktrees go next to the repo: use a folder like "../worktrees".`,
  });
  const problem = dirProblem(dir);
  if (problem) return refused(problem);
  const repo = realish(top);
  const parent = path.dirname(repo);
  const target = realish(path.resolve(repo, dir));
  if (!inside(parent, target) || parent === repo) return refused("is outside the repo's parent folder");
  if (target === repo) return refused('is the repo itself');
  if (inside(repo, target)) {
    const first = path.relative(repo, target).split(path.sep)[0];
    return first === '.git' ? refused("is inside the repo's .git folder") : { dir: target };
  }
  const hidden = path
    .relative(parent, target)
    .split(path.sep)
    .some((part) => part.startsWith('.'));
  return hidden ? refused('is in a hidden folder') : { dir: target };
}
