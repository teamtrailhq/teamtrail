import { realpathSync } from 'node:fs';
import { OperationError } from '../planning/operations/operationError';

/*
 * Paths an agent declares (the files a decision changes, the globs a claim touches) are matched against the
 * risk policy's rules. A rule only means something if every spelling of a file is the same file to it, so a
 * declared path is brought to one form first: Unicode NFC, `/` separators, no `.` or `..` segments, no trailing
 * dots or spaces on a segment (Windows drops them), relative to the repo. An absolute path inside the repo is made
 * relative to it; one outside the repo, or one that climbs out of it, names nothing the policy can judge: refused.
 */

const DRIVE = /^[A-Za-z]:\//;

/** The repo root as it may be spelled: as given, and through symlinks (`/var` and `/private/var` on macOS). */
function rootSpellings(repoRoot: string): string[] {
  const clean = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  let real = repoRoot;
  try {
    real = realpathSync(repoRoot);
  } catch {
    // a root that doesn't exist here is only ever matched as given
  }
  return [...new Set([clean(repoRoot), clean(real)])];
}

/** An absolute path, relative to the repo when it is inside it; throws when it isn't. */
function insideRepo(path: string, declared: string, repoRoot?: string) {
  const root = repoRoot ? rootSpellings(repoRoot).find((r) => path.startsWith(`${r}/`)) : undefined;
  if (root) return path.slice(root.length + 1);
  throw new OperationError(`"${declared}" is an absolute path outside the repo: give paths relative to the repo root`);
}

/** One declared path (or glob) in its repo-relative form. Throws when it is outside the repo. */
export function repoPath(declared: string, repoRoot?: string): string {
  let raw = declared.normalize('NFC').trim().replace(/\\/g, '/');
  if (!raw) throw new OperationError('a path is empty');
  if (raw.startsWith('~'))
    throw new OperationError(`"${declared}" is a home-relative path: give paths relative to the repo root`);
  if (raw.startsWith('/') || DRIVE.test(raw)) raw = insideRepo(raw, declared, repoRoot);
  const kept: string[] = [];
  for (const segment of raw.split('/')) {
    const part = segment === '.' || segment === '..' ? segment : segment.replace(/[. ]+$/, '');
    if (part === '' || part === '.') continue;
    if (part !== '..') kept.push(part);
    else if (kept.length) kept.pop();
    else throw new OperationError(`"${declared}" points outside the repo: give paths relative to the repo root`);
  }
  if (!kept.length) throw new OperationError(`"${declared}" names the repo itself, not a file in it`);
  return kept.join('/');
}

/** Declared paths in their repo-relative form, each once, in the order given. */
export function repoPaths(declared: string[] | undefined, repoRoot?: string): string[] {
  return [...new Set((declared ?? []).map((p) => repoPath(p, repoRoot)))];
}
