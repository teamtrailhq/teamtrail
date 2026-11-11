import { randomBytes } from 'node:crypto';
import { linkSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { symlinkFree } from '../projects/symlinkFree';

/** Throws when a symbolic link stands anywhere in `rel` under the tracker folder. */
export function refuseLinks(root: string, rel: string) {
  if (!symlinkFree(root, rel))
    throw new Error(`${rel}: a symbolic link stands in its path, and Teamtrail never writes through one.`);
}

/**
 * Writes a trail file as Teamtrail, never through a symbolic link: every part of the path inside the tracker folder
 * is checked (lstat), and the text goes to a new file in the same folder that then replaces the name (`rename`,
 * which replaces a link rather than following it). `create` keeps a file that is already there (false then): the
 * new file is linked in under the name, which fails when the name exists.
 */
export function writeTrackerFile(input: { root: string; rel: string; text: string; create?: boolean }): boolean {
  const { root, rel, text } = input;
  const file = path.join(root, rel);
  refuseLinks(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  refuseLinks(root, rel);
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  writeFileSync(tmp, text, { flag: 'wx' });
  try {
    if (!input.create) return (renameSync(tmp, file), true);
    linkSync(tmp, file);
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
  rmSync(path.join(root, rel), { force: true });
}
