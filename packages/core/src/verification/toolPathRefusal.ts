import { realpathSync } from 'node:fs';
import path from 'node:path';
import { programIdentity } from '../guides/programIdentity';

/** A virtualenv's own interpreter, which links to the Python it was made from, wherever that is installed. */
const VENV_PYTHON = /(^|\/)\.venv\/(bin|Scripts)\/python[\d.]*(\.exe)?$/i;

const within = (root: string, p: string) => p === root || p.startsWith(root + path.sep);

function real(p: string): string | undefined {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
}

/**
 * Why a check's program named by a path into the repo's tool folders (`node_modules/.bin/jest`, `.venv/bin/pytest`,
 * `./gradlew`) won't run, or undefined. That path made it a known check without the person's acknowledgement
 * (programIdentity.ts), so it must really be the repo's: with every symbolic link followed, the program stays inside
 * the repo. A virtualenv's interpreter may link out to the Python it was made from, as long as its folder is the
 * repo's. A bare name, any other path and a missing file are left to the run itself. `cwd` is the check's folder,
 * absolute and already confined to `root`.
 */
export function toolPathRefusal(o: { argv0: string; root: string; cwd: string }): string | undefined {
  const root = real(o.root);
  if (!root) return undefined;
  const id = programIdentity(o.argv0, path.relative(root, o.cwd));
  if (id.kind !== 'tool') return undefined;
  const at = path.join(root, id.rel);
  const target = real(at);
  if (!target) return undefined;
  if (within(root, target)) return undefined;
  const folder = real(path.dirname(at));
  if (VENV_PYTHON.test(id.rel) && folder && within(root, folder)) return undefined;
  return `${o.argv0} leads outside the repo (to ${target}); a program from the repo's tool folders must stay in the repo`;
}
