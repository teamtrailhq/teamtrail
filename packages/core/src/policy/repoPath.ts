import { OperationError } from '../planning/operations/operationError';

/*
 * Paths an agent declares (the files a decision changes, the globs a claim touches) are matched against the
 * risk policy's rules. A rule only means something if every spelling of a file is the same file to it, so a
 * declared path is brought to one form first: `/` separators, no `.` or `..` segments, relative to the repo.
 * A path that is absolute or climbs out of the repo is refused: it names nothing the policy can judge.
 */

const DRIVE = /^[A-Za-z]:/;

/** One declared path (or glob) in its repo-relative form. Throws when it is absolute or leaves the repo. */
export function repoPath(declared: string): string {
  const raw = declared.trim().replace(/\\/g, '/');
  if (!raw) throw new OperationError('a path is empty');
  if (raw.startsWith('/') || DRIVE.test(raw) || raw.startsWith('~'))
    throw new OperationError(`"${declared}" is an absolute path: give paths relative to the repo root`);
  const kept: string[] = [];
  for (const part of raw.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') kept.push(part);
    else if (kept.length) kept.pop();
    else throw new OperationError(`"${declared}" points outside the repo: give paths relative to the repo root`);
  }
  if (!kept.length) throw new OperationError(`"${declared}" names the repo itself, not a file in it`);
  return kept.join('/');
}

/** Declared paths in their repo-relative form, each once, in the order given. */
export function repoPaths(declared: string[] | undefined): string[] {
  return [...new Set((declared ?? []).map(repoPath))];
}
