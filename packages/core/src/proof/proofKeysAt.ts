import { realpathSync } from 'node:fs';
import path from 'node:path';
import { gitText } from '../evidence/git';
import { parseProofKeys } from './parseProofKeys';
import { PROOF_KEYS_DIR } from './repoProofKey';

/**
 * The proof keys committed at `ref` (`HEAD`, a base branch's sha), read from git, never from the working tree: a key
 * a pull request adds counts only once it is merged where the check reads keys. `root` is the tracker folder. Git
 * names the top folder by its real path (`/private/var/…` on macOS, where the temp folder is `/var/…`), so the
 * tracker folder is taken by its real path too before the two are compared.
 */
export async function proofKeysAt(root: string, ref: string): Promise<Map<string, string>> {
  if (ref.startsWith('-')) return new Map();
  const real = realFolder(root);
  if (!real) return new Map();
  const top = await gitText(real, ['rev-parse', '--show-toplevel']);
  if (!top) return new Map();
  const rel = path
    .relative(realFolder(top) ?? top, path.join(real, PROOF_KEYS_DIR))
    .split(path.sep)
    .join('/');
  const listing = await gitText(top, ['ls-tree', '--name-only', '--end-of-options', `${ref}:${rel}`]);
  const names = (listing ?? '').split('\n').filter((n) => n.endsWith('.pub'));
  const texts = await Promise.all(names.map((n) => gitText(top, ['show', '--end-of-options', `${ref}:${rel}/${n}`])));
  return parseProofKeys(texts.filter((t): t is string => t !== undefined));
}

function realFolder(folder: string): string | undefined {
  try {
    return realpathSync.native(folder);
  } catch {
    return undefined;
  }
}
