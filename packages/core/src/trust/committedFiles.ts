import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 });

const split = (out: string) => out.split('\0').filter(Boolean);

/**
 * Which of `files` (relative to the tracker folder) are in git's HEAD exactly as they are on disk: committed by
 * someone, and not changed since. A file an agent wrote or edited and nobody committed is not. Outside a git
 * repository, or when git fails, none are.
 */
export function committedFiles(root: string, files: string[]): Set<string> {
  if (!files.length) return new Set();
  try {
    const real = realpathSync.native(root);
    const top = git(real, ['rev-parse', '--show-toplevel']).trim();
    const rel = new Map(files.map((f) => [path.relative(top, path.join(real, f)), f]));
    const paths = [...rel.keys()];
    const tracked = new Set(split(git(top, ['ls-files', '-z', '--', ...paths])));
    const changed = new Set(split(git(top, ['diff', '--name-only', '-z', 'HEAD', '--', ...paths])));
    return new Set(paths.filter((p) => tracked.has(p) && !changed.has(p)).map((p) => rel.get(p)!));
  } catch {
    return new Set();
  }
}
