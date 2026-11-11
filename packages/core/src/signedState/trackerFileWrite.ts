import { randomBytes } from 'node:crypto';
import { linkSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { symlinkFree } from '../projects/symlinkFree';

const linkError = (rel: string) =>
  new Error(`${rel}: a symbolic link stands in its path, and Teamtrail never writes through one.`);

/** Throws when a symbolic link stands anywhere in `rel` under the tracker folder. */
export function refuseLinks(root: string, rel: string) {
  if (!symlinkFree(root, rel)) throw linkError(rel);
}

/**
 * For tests only: runs between the checks and the write, where a folder swapped for a link would redirect it
 * (signedStateReview.node.test.ts). Never set in the product.
 */
export const trackerWriteHooks: { afterCheck?: (dir: string) => void } = {};

/** The file's folder as the file system spells it, which must be the tracker folder's own: no link on the way. */
function realFolder(root: string, rel: string): string {
  const want = path.join(realpathSync(root), path.dirname(rel));
  const real = realpathSync(path.join(root, path.dirname(rel)));
  if (real !== want) throw linkError(rel);
  return real;
}

/** After a write: the path still resolves to where it was meant to; if not, what landed elsewhere is removed. */
function confirmLanded(at: string, rel: string) {
  let real: string | undefined;
  try {
    real = lstatSync(at).isSymbolicLink() ? undefined : realpathSync(at);
  } catch {
    real = undefined;
  }
  if (real === at) return;
  rmSync(at, { force: true });
  throw linkError(rel);
}

/**
 * Writes a trail file as Teamtrail, never through a symbolic link: every part of the path inside the tracker folder
 * is checked (lstat), the folder is resolved to its real path (which must be the tracker folder's), and the text
 * goes to a new file there that then replaces the name (`rename`, which replaces a link rather than following it).
 * A folder swapped for a link in between is caught after each step, and what was written through it removed.
 * `create` keeps a file that is already there (false then): the new file is linked in under the name, which fails
 * when the name exists.
 */
export function writeTrackerFile(input: { root: string; rel: string; text: string; create?: boolean }): boolean {
  const { root, rel, text } = input;
  refuseLinks(root, rel);
  mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  refuseLinks(root, rel);
  const dir = realFolder(root, rel);
  trackerWriteHooks.afterCheck?.(dir);
  const file = path.join(dir, path.basename(rel));
  const tmp = path.join(dir, `.${path.basename(rel)}.${randomBytes(6).toString('hex')}.tmp`);
  writeFileSync(tmp, text, { flag: 'wx' });
  try {
    confirmLanded(tmp, rel);
    if (input.create) linkSync(tmp, file);
    else renameSync(tmp, file);
    confirmLanded(file, rel);
    return true;
  } catch (e) {
    if (input.create && (e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Removes a trail file as Teamtrail: the name only (a link itself, never what it points to), never under a link. */
export function removeTrackerFile(root: string, rel: string) {
  refuseLinks(root, path.dirname(rel));
  const dir = realFolder(root, rel);
  trackerWriteHooks.afterCheck?.(dir);
  if (realpathSync(dir) !== dir) throw linkError(rel);
  rmSync(path.join(dir, path.basename(rel)), { force: true });
}
