import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** The repo's own git folder, where its linked worktrees are registered (`<git dir>/worktrees/<name>`). */
function commonGitDir(repo: string) {
  const dotGit = path.join(repo, '.git');
  if (!existsSync(dotGit) || statSync(dotGit).isDirectory()) return real(dotGit);
  // A checkout whose .git is a file (itself a worktree): its common dir is above `/worktrees/<name>`.
  const pointed = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim() ?? '';
  const abs = real(path.resolve(repo, pointed));
  const at = abs.lastIndexOf(`${path.sep}worktrees${path.sep}`);
  return at === -1 ? abs : abs.slice(0, at);
}

/** Whether `folder` is a linked worktree of the repo whose git dir is `gitDir`. */
function ownWorktree(folder: string, gitDir: string) {
  const dotGit = path.join(folder, '.git');
  if (!existsSync(dotGit) || statSync(dotGit).isDirectory()) return false;
  const pointed = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim() ?? '';
  return real(path.resolve(folder, pointed)).startsWith(`${gitDir}${path.sep}worktrees${path.sep}`);
}

/**
 * Why `target`, a folder beside the repo (under its parent, outside the repo), can't hold this repo's worktrees,
 * or undefined when it can. It must be a folder of this repo's: not the parent itself (where the other projects
 * are), not inside another git repository, and either new, empty, or holding nothing but this repo's worktrees.
 */
export function siblingProblem(o: { repo: string; parent: string; target: string }): string | undefined {
  if (o.target === o.parent) return 'is the folder your projects live in';
  for (let at = o.target; at !== o.parent && at.startsWith(o.parent); at = path.dirname(at))
    if (existsSync(path.join(at, '.git')) && at !== o.target) return 'is inside another git repository';
  if (!existsSync(o.target)) return undefined;
  if (existsSync(path.join(o.target, '.git'))) return 'is another git repository';
  const gitDir = commonGitDir(o.repo);
  const strangers = readdirSync(o.target).filter((n) => !ownWorktree(path.join(o.target, n), gitDir));
  return strangers.length ? "already holds files that aren't this repo's worktrees" : undefined;
}
