import { realpathSync } from 'node:fs';
import path from 'node:path';
import { git, gitText, zList } from '../evidence/git';

/**
 * Which of `files` (relative to the tracker folder) are in git's HEAD exactly as they are on disk: committed by
 * someone, and not changed since. A file an agent wrote or edited and nobody committed is not. Outside a git
 * repository, or when git fails, none are. git runs through the hardened helper (evidence/git.ts): nothing the
 * repo's own config names (an fsmonitor, hooks, diff programs, filters) runs when Approvals opens.
 */
export async function committedFiles(root: string, files: string[]): Promise<Set<string>> {
  if (!files.length) return new Set();
  let real: string;
  try {
    real = realpathSync.native(root);
  } catch {
    return new Set();
  }
  const top = await gitText(real, ['rev-parse', '--show-toplevel']);
  if (!top) return new Set();
  const rel = new Map(files.map((f) => [path.relative(top, path.join(real, f)), f]));
  const paths = [...rel.keys()];
  const listed = await git(top, ['ls-files', '-z', '--end-of-options', ...paths]);
  const diffed = await git(top, ['diff', '--name-only', '-z', '--end-of-options', 'HEAD', '--', ...paths]);
  if (listed.code !== 0 || diffed.code !== 0) return new Set();
  const tracked = new Set(zList(listed.stdout));
  const changed = new Set(zList(diffed.stdout));
  return new Set(paths.filter((p) => tracked.has(p) && !changed.has(p)).map((p) => rel.get(p)!));
}

/**
 * Which of `files` git confirms were never committed: in neither HEAD nor the index. Outside a git repository, or when
 * git fails, none are (so nothing is adopted on their absence).
 */
export async function absentFromHead(root: string, files: string[]): Promise<Set<string>> {
  if (!files.length) return new Set();
  let real: string;
  try {
    real = realpathSync.native(root);
  } catch {
    return new Set();
  }
  const top = await gitText(real, ['rev-parse', '--show-toplevel']);
  if (!top) return new Set();
  const rel = new Map(files.map((f) => [path.relative(top, path.join(real, f)), f]));
  const paths = [...rel.keys()];
  const indexed = await git(top, ['ls-files', '-z', '--end-of-options', ...paths]);
  const inHead = await git(top, ['ls-tree', '-z', '--name-only', '--end-of-options', 'HEAD', '--', ...paths]);
  if (indexed.code !== 0 || inHead.code !== 0) return new Set();
  const known = new Set([...zList(indexed.stdout), ...zList(inHead.stdout)]);
  return new Set(paths.filter((p) => !known.has(p)).map((p) => rel.get(p)!));
}
