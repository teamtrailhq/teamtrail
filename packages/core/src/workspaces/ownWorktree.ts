import { realpathSync } from 'node:fs';
import path from 'node:path';
import { git, gitText } from '../evidence/git';
import { readWorkspaceSettings } from './workspaceStore';
import { worktreeDir } from './worktreeDir';

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

const inside = (dir: string, p: string) => p.startsWith(dir + path.sep);

/**
 * The repo `folder` is a worktree of, when it is one Teamtrail may remove for this tracker: a linked worktree of
 * THIS repo (the one `root` lives in, by `git worktree list`), never the main checkout, and inside the folder
 * Teamtrail puts this repo's worktrees (workspaces.json `dir`, or the default). The workspace record names the
 * folder, and agents can write the record: nothing else in it is trusted.
 */
export async function ownWorktree(root: string, folder: string): Promise<string | undefined> {
  const top = await gitText(path.dirname(root), ['rev-parse', '--show-toplevel']);
  if (!top) return undefined;
  const listed = await git(top, ['worktree', 'list', '--porcelain', '-z']);
  if (listed.code !== 0) return undefined;
  const linked = listed.stdout
    .toString('utf8')
    .split('\0')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => real(l.slice('worktree '.length)))
    .filter((p) => p !== real(top));
  const target = real(folder);
  if (!linked.includes(target)) return undefined;
  const dirs = [worktreeDir(top, readWorkspaceSettings(root).settings.dir), worktreeDir(top)];
  const allowed = dirs.flatMap((d) => ('dir' in d ? [real(d.dir)] : []));
  return allowed.some((d) => inside(d, target)) ? top : undefined;
}
